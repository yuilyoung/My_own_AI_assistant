import test from 'node:test';
import assert from 'node:assert/strict';
const loadWav = () => import('../wav.mjs');
const loadVoice = () => import('../voice-input.mjs');

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('WAV encoding is real mono PCM16/16kHz with saturated little-endian samples',async()=>{
 const {encodeWav}=await loadWav();
 const pcm=new Float32Array(1600);pcm.set([-2,-0.5,0,0.5,2]);
 const bytes=encodeWav(pcm);const v=new DataView(bytes);
 assert.equal(new TextDecoder().decode(new Uint8Array(bytes,0,4)),'RIFF');
 assert.equal(v.getUint32(4,true),3236);assert.equal(v.getUint32(24,true),16000);
 assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),16);
 assert.equal(v.getInt16(44,true),-32768);assert.equal(v.getInt16(52,true),32767);
});

test('WAV encoding rejects nonfinite, too short and overlong recordings',async()=>{
 const {encodeWav}=await loadWav();
 for(const a of [new Float32Array(1599),new Float32Array(480001),new Float32Array(1600).fill(NaN),new Float32Array(1600).fill(Infinity)])
  assert.throws(()=>encodeWav(a));
 assert.equal(encodeWav(new Float32Array(480000)).byteLength,960044);
});

function fakeRecorder(){return {start:async()=>{},finish:async()=>new ArrayBuffer(3244),cancel(){this.cancelled=true;}};}

test('voice transcription fills review result without submitting a chat turn',async()=>{
 const {VoiceInput}=await loadVoice();const calls=[],results=[];
 const voice=new VoiceInput({recorder:fakeRecorder(),request:async(path,options={})=>{
  calls.push([path,options]);if(options.method==='POST')return {id:'job'};
  if(options.method==='DELETE')return null;
  return {status:'completed',text:'한국어 인식 결과'};
 },onResult:text=>results.push(text)});
 await voice.start('assistant-session');await voice.finish();
 assert.deepEqual(results,['한국어 인식 결과']);
 assert(calls.every(([path])=>!path.includes('/turns')));
 assert.equal(calls[0][1].headers['Content-Type'],'audio/wav');
 assert.equal(voice.kind,'idle');
});

test('cancel during job creation deletes late job and never displays its transcript',async()=>{
 const {VoiceInput}=await loadVoice();const post=deferred(),begun=deferred(),calls=[],results=[];
 const voice=new VoiceInput({recorder:fakeRecorder(),request:async(path,options={})=>{
  calls.push([path,options.method]);if(options.method==='POST'){begun.resolve();return post.promise;}
  return null;
 },onResult:text=>results.push(text)});
 await voice.start('old-session');const finishing=voice.finish();await begun.promise;
 voice.cancel();post.resolve({id:'late-job'});await finishing;
 assert.deepEqual(results,[]);assert(calls.some(([p,m])=>p==='/sessions/old-session/transcriptions/late-job'&&m==='DELETE'));
});

test('cancel while microphone access is pending cannot re-enter recording',async()=>{
 const {VoiceInput}=await loadVoice();const pending=deferred();const recorder=fakeRecorder();recorder.start=()=>pending.promise;
 const voice=new VoiceInput({recorder,request:async()=>null});
 const starting=voice.start('old');voice.cancel();pending.resolve();await starting;
 assert.equal(voice.kind,'idle');assert.equal(recorder.cancelled,true);
});

test('invalid recognition status and provider failure do not emit text',async()=>{
 const {VoiceInput}=await loadVoice();const results=[];
 const voice=new VoiceInput({recorder:fakeRecorder(),request:async(path,options={})=>{
  if(options.method==='POST')return {id:'job'};
  if(options.method==='DELETE')return null;
  return {status:'error',error:'STT_UNAVAILABLE_OR_INVALID_OUTPUT'};
 },onResult:t=>results.push(t)});
 await voice.start('s');await assert.rejects(()=>voice.finish());
 assert.deepEqual(results,[]);assert.equal(voice.kind,'idle');
});

test('cancel during getUserMedia stops a late microphone stream',async()=>{
 const {MicrophoneRecorder}=await import('../recorder.mjs');const media=deferred();let stopped=0;
 const recorder=new MicrophoneRecorder({mediaDevices:{getUserMedia:()=>media.promise}});
 const start=recorder.start();recorder.cancel();media.resolve({getTracks:()=>[{stop:()=>stopped++}]});
 await assert.rejects(start,{name:'AbortError'});assert.equal(stopped,1);
});

test('permission rejection surfaces without opening an audio pipeline',async()=>{
 const {MicrophoneRecorder}=await import('../recorder.mjs');
 const recorder=new MicrophoneRecorder({mediaDevices:{getUserMedia:async()=>{throw new DOMException('denied','NotAllowedError');}}});
 await assert.rejects(()=>recorder.start(),{name:'NotAllowedError'});
 recorder.cancel();
});

test('recording uses actual context rate, resamples to PCM16/16k and stops tracks',async()=>{
 const {MicrophoneRecorder}=await import('../recorder.mjs');let stopped=0,closed=0,rate=0,count=0;
 class Context {
  constructor(){this.sampleRate=48000;this.audioWorklet={addModule:async()=>{}};this.destination={};}
  async resume(){}
  async close(){closed++;}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
 }
 class Worklet {
  constructor(){this.port={postMessage:()=>{
   this.port.onmessage({data:{type:'samples',samples:new Float32Array(4800).fill(0.2)}});
   this.port.onmessage({data:{type:'done',limit:false}});
  }};}
  connect(){} disconnect(){}
 }
 class Offline {
  constructor(channels,n,r){count=n;rate=r;this.destination={};}
  createBuffer(){return {copyToChannel(){}};}
  createBufferSource(){return {connect(){},start(){}};}
  async startRendering(){return {getChannelData:()=>new Float32Array(count).fill(0.2)};}
 }
 const recorder=new MicrophoneRecorder({
  mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})},
  AudioContext:Context,AudioWorkletNode:Worklet,OfflineAudioContext:Offline,
 });
 await recorder.start();const wav=await recorder.finish();
 assert.equal(rate,16000);assert.equal(count,1600);assert.equal(wav.byteLength,3244);
 assert(stopped>=1);assert(closed>=1);assert.equal(recorder.capture,null);
});

test('unexpected microphone track end releases the stream and reports a device error',async()=>{
 const {MicrophoneRecorder}=await import('../recorder.mjs');
 let ended,stopped=0,removed=0,closed=0;const failures=[];
 const track={
  stop(){stopped++;},
  addEventListener(type,handler){if(type==='ended')ended=handler;},
  removeEventListener(type,handler){if(type==='ended'&&handler===ended)removed++;}
 };
 class Context {
  sampleRate=16000;destination={};audioWorklet={addModule:async()=>{}};
  async resume(){} async close(){closed++;}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
 }
 class Worklet {
  port={onmessage:null,postMessage(){}};
  connect(){} disconnect(){}
 }
 const recorder=new MicrophoneRecorder({
  mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[track],getTracks:()=>[track]})},
  AudioContext:Context,AudioWorkletNode:Worklet,
 });
 await recorder.start(()=>{},error=>failures.push(error.message));
 assert.equal(typeof ended,'function');
 ended();
 assert.equal(recorder.capture,null);
 assert.equal(stopped,1);assert.equal(removed,1);assert.equal(closed,1);
 assert.match(failures[0],/마이크 연결이 중단/);
 ended(); // A late device event must not report another failure.
 assert.equal(failures.length,1);
});

test('voice session returns to idle after a microphone disconnect; stale events cannot cancel a new session',async()=>{
 const {VoiceInput}=await loadVoice();
 const callbacks=[],errors=[];const recorder=fakeRecorder();
 recorder.start=async(_limit,onFailure)=>{callbacks.push(onFailure);};
 const voice=new VoiceInput({recorder,request:async()=>null,onError:error=>errors.push(String(error))});
 await voice.start('old-session');
 assert.equal(voice.kind,'recording');
 callbacks[0](new Error('device unplugged'));
 assert.equal(voice.kind,'idle');
 assert.equal(recorder.cancelled,true);
 assert.deepEqual(errors,['Error: device unplugged']);
 await voice.start('new-session');
 callbacks[0](new Error('stale error'));
 assert.equal(voice.kind,'recording');
 assert.equal(errors.length,1);
 voice.cancel();
});

test('cancelled recorder does not load a worklet after its AudioContext resumes late',async()=>{
 const {MicrophoneRecorder}=await import('../recorder.mjs');
 const resumed=deferred();let modules=0,stopped=0;
 class Context {
  sampleRate=16000;destination={};audioWorklet={addModule:async()=>{modules++;}};
  resume(){return resumed.promise;}
  async close(){}
 }
 const recorder=new MicrophoneRecorder({
  mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})},
  AudioContext:Context,
 });
 const starting=recorder.start();
 await new Promise(resolve=>setImmediate(resolve));
 recorder.cancel();resumed.resolve();
 await assert.rejects(starting,{name:'AbortError'});
 assert.equal(modules,0);assert.equal(stopped,1);
});

test('AudioWorklet processor crash cancels capture and reports failure only once',async()=>{
 const {MicrophoneRecorder}=await import('../recorder.mjs');
 let node,stopped=0,closed=0,removed=0;const failures=[];
 const track={stop(){stopped++;},addEventListener(){},removeEventListener(){}};
 class Context {
  sampleRate=16000;destination={};audioWorklet={addModule:async()=>{}};
  async resume(){} async close(){closed++;}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
 }
 class Worklet {
  constructor(){node=this;this.port={onmessage:null,postMessage(){}};}
  addEventListener(type,listener){if(type==='processorerror')this.crash=listener;}
  removeEventListener(type,listener){if(type==='processorerror'&&this.crash===listener)removed++;}
  connect(){} disconnect(){}
 }
 const recorder=new MicrophoneRecorder({
  mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[track],getTracks:()=>[track]})},
  AudioContext:Context,AudioWorkletNode:Worklet,
 });
 await recorder.start(()=>{},error=>failures.push(error.message));
 const crash=node.crash;assert.equal(typeof crash,'function');
 crash();
 assert.equal(recorder.capture,null);assert.equal(stopped,1);assert.equal(closed,1);assert.equal(removed,1);
 assert.match(failures[0],/오디오 처리기/);
 crash(); // An event from the disposed worklet must not affect the next capture.
 assert.equal(failures.length,1);
});

test('invalid or overlong worklet data aborts capture instead of leaving voice recording',async()=>{
 const {MicrophoneRecorder}=await import('../recorder.mjs');
 for(const samples of [new Int16Array([1,2]),new Float32Array(480001)]){
  let node,stopped=0;const failures=[];
  class Context {
   sampleRate=16000;destination={};audioWorklet={addModule:async()=>{}};
   async resume(){} async close(){}
   createMediaStreamSource(){return {connect(){},disconnect(){}};}
  }
  class Worklet {
   constructor(){node=this;this.port={onmessage:null,postMessage(){}};}
   connect(){} disconnect(){}
  }
  const recorder=new MicrophoneRecorder({
   mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})},
   AudioContext:Context,AudioWorkletNode:Worklet,
  });
  await recorder.start(()=>{},error=>failures.push(error.message));
  node.port.onmessage({data:{type:'samples',samples}});
  assert.equal(recorder.capture,null);assert.equal(stopped,1);
  assert.match(failures[0],/녹음 데이터/);
 }
});
