import test from 'node:test';
import assert from 'node:assert/strict';
let Processor;
globalThis.sampleRate=16000;
globalThis.AudioWorkletProcessor=class {
 constructor(){this.port={messages:[],postMessage:message=>this.port.messages.push(message)};}
};
globalThis.registerProcessor=(name,ctor)=>{Processor=ctor;};
await import('../capture-worklet.mjs');

test('worklet downmixes, flushes partial buffer and stops after explicit finish',()=>{
 const p=new Processor();p.process([[new Float32Array([0.2,0.4]),new Float32Array([0.6,0.8])]]);
 p.port.onmessage({data:'finish'});
 assert(Math.abs(p.port.messages[0].samples[0]-0.4)<0.001);
 assert(Math.abs(p.port.messages[0].samples[1]-0.6)<0.001);
 assert.equal(p.port.messages[1].type,'done');assert.equal(p.process([[]]),false);
});

test('worklet caps recording at exactly thirty seconds',()=>{
 const p=new Processor();const block=new Float32Array(128).fill(0.2);
 for(let i=0;i<4000;i++)p.process([[block]]);
 const chunks=p.port.messages.filter(m=>m.type==='samples');
 assert.equal(chunks.reduce((n,m)=>n+m.samples.length,0),480000);
 assert.equal(p.port.messages.filter(m=>m.type==='done').length,1);
 assert.equal(p.port.messages.at(-1).limit,true);
});

test('worklet cancellation does not release a buffered recording',()=>{
 const p=new Processor();p.process([[new Float32Array([0.5])]]);
 p.port.onmessage({data:'cancel'});p.port.onmessage({data:'finish'});
 assert.deepEqual(p.port.messages,[]);assert.equal(p.process([[]]),false);
});
