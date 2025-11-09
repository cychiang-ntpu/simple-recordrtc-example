class PcmCollectorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._buffer = new Float32Array(0);
    this._batchQuanta = 8; // 8 * 128 = 1024 samples per flush (per channel)
    this._quantaCount = 0;
  }

  _flushAndPost() {
    if (this._buffer && this._buffer.length) {
      // Transfer the underlying ArrayBuffer to main thread
      const sab = this._buffer.buffer;
      // Note: transfer sab; main thread must reconstruct with known length
      this.port.postMessage({ type: 'pcm', buffer: sab, length: this._buffer.length, sampleRate: sampleRate });
      // Reset local buffer
      this._buffer = new Float32Array(0);
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const ch0 = input[0]; // mono path: first channel
      if (ch0 && ch0.length) {
        // Append to staging buffer
        const prev = this._buffer;
        const next = new Float32Array(prev.length + ch0.length);
        if (prev.length) next.set(prev, 0);
        next.set(ch0, prev.length);
        this._buffer = next;
        this._quantaCount++;
        if (this._quantaCount >= this._batchQuanta) {
          this._flushAndPost();
          this._quantaCount = 0;
        }
      }
    }
    // Pass-through: copy input to output to keep node active if connected
    const output = outputs[0];
    if (output && inputs[0] && inputs[0][0]) {
      const inCh = inputs[0][0];
      const outCh = output[0];
      if (outCh && inCh) outCh.set(inCh);
    }
    return true;
  }
}

registerProcessor('pcm-collector', PcmCollectorProcessor);
