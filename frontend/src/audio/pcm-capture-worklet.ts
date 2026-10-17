class TwinklePcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.inputRate = sampleRate;
    this.targetRate = 16000;
    this.ratio = this.inputRate / this.targetRate;


    this.cellFill = 0;
    this.cellSum = 0;

    // Batch ~10 ms of 16 kHz PCM per message instead of one message per
    // 128-sample render quantum (~375 msgs/s), cutting main-thread work.
    this.chunkSamples = 160;
    this.pending = new Int16Array(this.chunkSamples * 4);
    this.pendingLength = 0;
  }

  pushSample(value) {
    const clamped = value > 1 ? 1 : value < -1 ? -1 : value;

    if (this.pendingLength >= this.pending.length) {
      const grown = new Int16Array(this.pending.length * 2);
      grown.set(this.pending);
      this.pending = grown;
    }

    this.pending[this.pendingLength] =
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    this.pendingLength += 1;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    // Keep the audio graph alive. LiveTalkModal routes this through a gain
    // node whose value is 0, so microphone audio is never played back.
    if (output) {
      if (input) {
        const length = Math.min(output.length, input.length);

        for (let i = 0; i < length; i += 1) {
          output[i] = input[i] || 0;
        }

        for (let i = length; i < output.length; i += 1) {
          output[i] = 0;
        }
      } else {
        output.fill(0);
      }
    }

    if (!input || input.length === 0) {
      return true;
    }

    const ratio = this.ratio;

    for (let n = 0; n < input.length; n += 1) {
      const sample = input[n] || 0;

      if (ratio <= 1.0001) {
        // Already 16 kHz (or lower): pass through unchanged.
        this.pushSample(sample);
        continue;
      }

      let remaining = 1;
      while (remaining > 1e-9) {
        const room = ratio - this.cellFill;
        const take = remaining < room ? remaining : room;

        this.cellSum += sample * take;
        this.cellFill += take;
        remaining -= take;

        if (this.cellFill >= ratio - 1e-9) {
          this.pushSample(this.cellSum / ratio);
          this.cellSum = 0;
          this.cellFill = 0;
        }
      }
    }

    if (this.pendingLength >= this.chunkSamples) {
      const out = this.pending.slice(0, this.pendingLength);
      this.pendingLength = 0;
      this.port.postMessage(out.buffer, [out.buffer]);
    }

    return true;
  }
}

registerProcessor(
  'twinkle-pcm-capture',
  TwinklePcmCaptureProcessor,
);
