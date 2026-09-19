class TwinklePcmCaptureProcessor extends AudioWorkletProcessor {
  private readonly inputRate: number;
  private readonly targetRate: number;

  constructor() {
    super();

    this.inputRate = sampleRate;
    this.targetRate = 16000;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
  ): boolean {
    const input: Float32Array | undefined = inputs[0]?.[0];
    const output: Float32Array | undefined = outputs[0]?.[0];

    // Keep the Web Audio graph alive without sending microphone audio
    // back to the speakers.
    if (output && input) {
      const length = Math.min(output.length, input.length);

      for (let i = 0; i < length; i += 1) {
        output[i] = input[i] ?? 0;
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

      const clamped = Math.max(-1, Math.min(1, sample));

      pcm[i] =
        clamped < 0
          ? clamped * 0x8000
          : clamped * 0x7fff;
    }

    this.port.postMessage(pcm.buffer, [pcm.buffer]);

    return true;
  }
}

registerProcessor(
  'twinkle-pcm-capture',
  TwinklePcmCaptureProcessor,
);
