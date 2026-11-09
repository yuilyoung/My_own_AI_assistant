import {mouthLevel} from './core.mjs';

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
    this.finish?.();this.finish=null;this.onLevel(0);
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
    const render=()=>{
      if(generation!==this.generation || !isCurrent()) { this.stop();return; }
      analyser.getFloatTimeDomainData(samples);this.onLevel(mouthLevel(samples));
      this.frame=requestAnimationFrame(render);
    };
    await new Promise((resolve,reject)=>{
      this.finish=()=>{analyser.disconnect();resolve();};
      source.onended=()=>{
        source.disconnect();
        if(generation===this.generation) {
          cancelAnimationFrame(this.frame);this.source=null;this.onLevel(0);this.finish?.();this.finish=null;
        }
      };
      try {
        source.start(); render();
      } catch (error) {
        // AudioBufferSourceNode.start or the first analyzer callback can fail.
        // A rejected playback must not retain audio nodes or a pending finish.
        cancelAnimationFrame(this.frame);
        source.onended=null;
        if(this.source===source) this.source=null;
        try { source.stop(); } catch {}
        try { source.disconnect(); } catch {}
        analyser.disconnect();
        this.finish=null;
        this.onLevel(0);
        reject(error);
      }
    });
  }
  async close() {this.stop();if(this.context)await this.context.close();this.context=null;}
}
