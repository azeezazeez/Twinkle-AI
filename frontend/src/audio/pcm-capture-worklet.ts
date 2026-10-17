// AudioWorklet source for Twinkle Live Talk.
//
// IMPORTANT:
// This file intentionally contains JavaScript-compatible TypeScript only.
// LiveTalkModal imports it with ?raw and loads it through a Blob with the
// explicit application/javascript MIME type. This prevents Vite/Vercel from
// guessing the MIME type from the .ts extension.

class TwinklePcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.inputRate = sampleRate;
    this.targetRate = 16000;
    // Batch ~20 ms of 16 kHz PCM per message instead of one message per
    // 128-sample render quantum (~375 msgs/s), cutting main-thread work.
    this.chunkSamples = 320;
    this.pending = new Int16Array(this.chunkSamples * 2);
    this.pendingLength = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    // Keep the audio graph alive. LiveTalkModal routes this through a gain
    // node whose value is 0, so microphone audio is never played back.
    if (output && input) {
      const length = Math.min(output.length, input.length);

      for (let i = 0; i < length; i += 1) {
        output[i] = input[i] || 0;
      }

      for (let i = length; i < output.length; i += 1) {
        output[i] = 0;
      }
    }

    if (!input || input.length === 0) {
      return true;
    }

    const ratio = this.inputRate / this.targetRate;
    const outputLength = Math.max(
      1,
      Math.round(input.length / ratio),
    );

    const pcm = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i += 1) {
      const position = i * ratio;

      const left = Math.min(
        Math.floor(position),
        input.length - 1,
      );

      const right = Math.min(
        left + 1,
        input.length - 1,
      );

      const fraction = position - left;

      const sample =
        input[left] * (1 - fraction) +
        input[right] * fraction;

      const clamped = Math.max(
        -1,
        Math.min(1, sample),
      );

      pcm[i] =
        clamped < 0
          ? clamped * 0x8000
          : clamped * 0x7fff;
    }

    if (this.pendingLength + pcm.length > this.pending.length) {
      const grown = new Int16Array((this.pendingLength + pcm.length) * 2);
      grown.set(this.pending.subarray(0, this.pendingLength));
      this.pending = grown;
    }
    this.pending.set(pcm, this.pendingLength);
    this.pendingLength += pcm.length;

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
