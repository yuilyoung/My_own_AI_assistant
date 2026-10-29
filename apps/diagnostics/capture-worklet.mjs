// Runs on the audio render thread. Downmix to mono and stop at 30 seconds.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.used = 0;
    this.total = 0;
    this.closed = false;
    this.port.onmessage = (event) => {
      if (event.data === 'finish') this.finish(false);
      if (event.data === 'cancel') {
        this.closed = true;
        this.used = 0;
      }
    };
  }
  flush() {
    if (!this.used) return;
    const chunk = this.buffer.slice(0, this.used);
    this.port.postMessage({ type: 'samples', samples: chunk }, [chunk.buffer]);
    this.used = 0;
  }
  finish(limit) {
    if (this.closed) return;
    this.flush();
    this.closed = true;
    this.port.postMessage({ type: 'done', limit });
  }
  process(inputs) {
    if (this.closed) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] || 0;
      this.buffer[this.used++] = value / channels.length;
      this.total++;
      if (this.used === this.buffer.length) this.flush();
      if (this.total >= sampleRate * 30) {
        this.finish(true);
        return false;
      }
    }
    return true; // The output is intentionally silent: never monitor the microphone to speakers.
  }
}
registerProcessor('local-pcm-capture', CaptureProcessor);
