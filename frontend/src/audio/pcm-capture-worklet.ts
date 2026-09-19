class TwinklePcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inputRate = sampleRate;
    this.targetRate = 16000;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
 
    if (output && input) {
      for (let i = 0; i < output.length; i += 1) {
        output[i] = input[i] || 0;
      }
    }

    if (!input || input.length === 0) return true;

    const ratio = this.inputRate / this.targetRate;
    const outputLength = Math.max(1, Math.round(input.length / ratio));
    const pcm = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i += 1) {
      const position = i * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, input.length - 1);
      const fraction = position - left;
      const sample = input[left] * (1 - fraction) + input[right] * fraction;
      const clamped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor('twinkle-pcm-capture', TwinklePcmCaptureProcessor);
