import { encodeWav } from './wav.mjs';
const aborted = () => new DOMException('Recording cancelled', 'AbortError');

export class MicrophoneRecorder {
  constructor(deps = {}) {
    this.deps = deps;
    this.generation = 0;
    this.capture = null;
  }
  release(capture) {
    if (!capture) return;
    clearTimeout(capture.timer);
    capture.stream?.getTracks().forEach((track) => track.stop());
    try {
      capture.source?.disconnect();
      capture.node?.disconnect();
    } catch {}
    if (capture.node) capture.node.port.onmessage = null;
    capture.context?.close().catch(() => {});
  }
  cancel() {
    this.generation++;
    const capture = this.capture;
    this.capture = null;
    capture?.rejectFinish?.(aborted());
    if (capture) capture.chunks = [];
    this.release(capture);
  }
  async start(onLimit = () => {}) {
    this.cancel();
    const generation = this.generation;
    const capture = { chunks: [], frames: 0, done: false };
    this.capture = capture;
    const media = this.deps.mediaDevices ?? globalThis.navigator?.mediaDevices;
    if (!media?.getUserMedia) {
      this.capture = null;
      throw new Error(
        '이 브라우저에서 마이크를 사용할 수 없습니다. localhost 또는 HTTPS를 사용하세요.',
      );
    }
    try {
      const stream = await media.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        throw aborted();
      }
      capture.stream = stream;
      const Context = this.deps.AudioContext ?? globalThis.AudioContext;
      capture.context = new Context();
      capture.rate = capture.context.sampleRate;
      await capture.context.resume();
      await capture.context.audioWorklet.addModule(
        new URL('./capture-worklet.mjs', import.meta.url),
      );
      if (generation !== this.generation) throw aborted();
      const Worklet = this.deps.AudioWorkletNode ?? globalThis.AudioWorkletNode;
      capture.node = new Worklet(capture.context, 'local-pcm-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      capture.node.port.onmessage = (event) => {
        if (generation !== this.generation) return;
        if (event.data.type === 'samples') {
          const chunk = event.data.samples;
          if (
            !(chunk instanceof Float32Array) ||
            capture.frames + chunk.length > capture.rate * 30
          ) {
            this.cancel();
            return;
          }
          capture.chunks.push(chunk);
          capture.frames += chunk.length;
        } else if (event.data.type === 'done') {
          capture.done = true;
          capture.resolveFinish?.();
          if (event.data.limit) onLimit();
        }
      };
      capture.source = capture.context.createMediaStreamSource(stream);
      capture.source.connect(capture.node);
      capture.node.connect(capture.context.destination);
      capture.timer = setTimeout(() => onLimit(), 30_000);
    } catch (error) {
      this.release(capture);
      if (this.capture === capture) this.capture = null;
      throw error;
    }
  }
  async finish() {
    const capture = this.capture;
    const generation = this.generation;
    if (!capture?.node) throw new Error('녹음이 아직 시작되지 않았습니다.');
    clearTimeout(capture.timer);
    try {
      if (!capture.done) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('마이크 종료 응답이 없습니다.')), 2000);
          capture.resolveFinish = () => {
            clearTimeout(timeout);
            resolve();
          };
          capture.rejectFinish = (error) => {
            clearTimeout(timeout);
            reject(error);
          };
          capture.node.port.postMessage('finish');
        });
      }
      if (generation !== this.generation) throw aborted();
      this.release(capture); // Stop physical microphone before resampling/uploading.
      const pcm = new Float32Array(capture.frames);
      let offset = 0;
      for (const chunk of capture.chunks) {
        pcm.set(chunk, offset);
        offset += chunk.length;
      }
      capture.chunks = [];
      let samples = pcm;
      if (capture.rate !== 16000) {
        const Offline = this.deps.OfflineAudioContext ?? globalThis.OfflineAudioContext;
        const count = Math.min(480000, Math.floor((pcm.length * 16000) / capture.rate));
        if (count < 1600) throw new Error('0.1초 이상 녹음해 주세요.');
        const offline = new Offline(1, count, 16000);
        const input = offline.createBuffer(1, pcm.length, capture.rate);
        input.copyToChannel(pcm, 0);
        const source = offline.createBufferSource();
        source.buffer = input;
        source.connect(offline.destination);
        source.start();
        samples = (await offline.startRendering()).getChannelData(0);
      }
      if (generation !== this.generation) throw aborted();
      return encodeWav(samples);
    } finally {
      this.release(capture);
      capture.chunks = [];
      if (this.capture === capture) this.capture = null;
    }
  }
}
