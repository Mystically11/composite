const SIZE = 8192;
const MASK = SIZE - 1;
const GRAIN = 2048;

class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'ratio',
      defaultValue: 1,
      minValue: 0.25,
      maxValue: 4,
      automationRate: 'k-rate',
    }];
  }

  constructor() {
    super();
    this.buffers = [];
    this.write = 0;
    this.phase = 0;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const channels = Math.min(input.length, output.length);
    const frames = output[0].length;
    const ratio = params.ratio[0];

    if (ratio === 1) {
      for (let c = 0; c < channels; c++) output[c].set(input[c]);
      this.write = 0;
      this.phase = 0;
      this.buffers.length = 0;
      return true;
    }

    while (this.buffers.length < channels) this.buffers.push(new Float32Array(SIZE));

    const step = (1 - ratio) / GRAIN;

    for (let i = 0; i < frames; i++) {
      const w = this.write;

      for (let c = 0; c < channels; c++) this.buffers[c][w] = input[c][i];

      const phaseA = this.phase;
      const phaseB = phaseA < 0.5 ? phaseA + 0.5 : phaseA - 0.5;

      const gainA = Math.sin(Math.PI * phaseA);
      const gainB = Math.sin(Math.PI * phaseB);
      const delayA = phaseA * GRAIN;
      const delayB = phaseB * GRAIN;

      for (let c = 0; c < channels; c++) {
        const buf = this.buffers[c];
        output[c][i] = read(buf, w - delayA) * gainA + read(buf, w - delayB) * gainB;
      }

      this.write = (w + 1) & MASK;
      this.phase += step;
      if (this.phase >= 1) this.phase -= 1;
      else if (this.phase < 0) this.phase += 1;
    }

    return true;
  }
}

function read(buf, pos) {
  const wrapped = (pos % SIZE + SIZE) % SIZE;
  const i = Math.floor(wrapped);
  const frac = wrapped - i;
  return buf[i & MASK] * (1 - frac) + buf[(i + 1) & MASK] * frac;
}

registerProcessor('pitch-shifter', PitchShifter);
