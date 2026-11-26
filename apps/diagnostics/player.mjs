import {mouthLevel, voiceBrightness} from './core.mjs';

/** Owns only local audio playback. No browser speech synthesis or remote fallback. */
export class Player {
  context=null;
  source=null;
  finish=null;
  frame=0;
  generation=0;
  constructor(onLevel) { this.onLevel=onLevel; }
  async unlock() {
    this.context??=new AudioContext();
    await this.context.resume();
  }
  stop() {
    ++this.generation;
    cancelAnimationFrame(this.frame);
    if(this.source) { const source=this.source; this.source=null; source.onended=null; try { source.stop(); } catch {} source.disconnect(); }
    this.finish?.();this.finish=null;this.onLevel(0, 0.5);
  }
  async play(bytes,isCurrent) {
    this.stop(); const generation=this.generation;
    await this.unlock();
    // A mode change or stop may happen before AudioContext.resume() completes.
    if(generation!==this.generation || !isCurrent()) return;
    const context=this.context;
    if(!context) return;
    const buffer=await context.decodeAudioData(bytes);
    if(generation!==this.generation || !isCurrent()) return;
    const source=context.createBufferSource();
    const analyser=context.createAnalyser();analyser.fftSize=512;
    source.buffer=buffer;source.connect(analyser);analyser.connect(context.destination);this.source=source;
    const samples=new Float32Array(analyser.fftSize);
    await new Promise((resolve,reject)=>{
      this.finish=()=>{analyser.disconnect();resolve();};
      source.onended=()=>{
        if(generation===this.generation) {
          source.disconnect();
          this.source=null;
          this.stop();
        }
      };
      const fail = error => {
        this.finish = null;
        analyser.disconnect();
        this.stop();
        reject(error);
      };
      const render = () => {
        if (generation !== this.generation) return;
        try {
          if (!isCurrent()) { this.stop(); return; }
          analyser.getFloatTimeDomainData(samples);
          const level = mouthLevel(samples);
          this.onLevel(level, level > 0 ? voiceBrightness(samples, context.sampleRate) : 0.5);
          this.frame = requestAnimationFrame(render);
        } catch (error) {
          fail(error);
        }
      };
      try {
        source.start(); render();
      } catch (error) {
        fail(error);
      }
    });
  }
  async close() {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context) await context.close();
  }
}
