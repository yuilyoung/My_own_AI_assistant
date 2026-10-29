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
    if(this.source) { try { this.source.stop(); } catch {} this.source.disconnect(); this.source=null; }
    this.finish?.();this.finish=null;this.onLevel(0);
  }
  async play(bytes,isCurrent) {
    this.stop(); const generation=this.generation;
    await this.unlock();
    const buffer=await this.context.decodeAudioData(bytes);
    if(generation!==this.generation || !isCurrent()) return;
    const source=this.context.createBufferSource();
    const analyser=this.context.createAnalyser();analyser.fftSize=512;
    source.buffer=buffer;source.connect(analyser);analyser.connect(this.context.destination);this.source=source;
    const samples=new Float32Array(analyser.fftSize);
    const render=()=>{
      if(generation!==this.generation || !isCurrent()) { this.stop();return; }
      analyser.getFloatTimeDomainData(samples);this.onLevel(mouthLevel(samples));
      this.frame=requestAnimationFrame(render);
    };
    await new Promise(resolve=>{
      this.finish=()=>{analyser.disconnect();resolve();};
      source.onended=()=>{
        if(generation===this.generation) {
          cancelAnimationFrame(this.frame);this.source=null;this.onLevel(0);this.finish?.();this.finish=null;
        }
      };
      source.start(); render();
    });
  }
  async close() {this.stop();if(this.context)await this.context.close();this.context=null;}
}
