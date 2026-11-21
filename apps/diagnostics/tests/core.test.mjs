import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TurnGate,mouthLevel,voiceBrightness} from '../core.mjs';

test('silence closes mouth',()=>assert.equal(mouthLevel(new Float32Array(20)),0));
test('loud audio is clamped',()=>assert.equal(mouthLevel(new Float32Array([1,-1])),1));
test('non-finite samples fail closed',()=>assert.equal(mouthLevel(new Float32Array([NaN])),0));
test('empty audio closes mouth',()=>assert.equal(mouthLevel(new Float32Array()),0));
test('voice brightness tracks the same frequency across output sample rates',()=>{
 const values=[16000,44100,48000,96000].map(rate=>{
  const samples=Float32Array.from({length:512},(_,i)=>0.2*Math.sin(2*Math.PI*1600*i/rate));
  return voiceBrightness(samples,rate);
 });
 assert.ok(values.every(value=>value>0.4 && value<0.6));
 assert.ok(Math.max(...values)-Math.min(...values)<0.02);
});
test('unvoiced or invalid audio has neutral brightness',()=>{
 for(const samples of [[],[0,0],[.01,-.01],[0,NaN],[Infinity,0]]) {
  assert.equal(voiceBrightness(samples,48000),0.5);
 }
 assert.equal(voiceBrightness([1,-1],undefined),0.5);
 assert.equal(voiceBrightness([1,-1],0),0.5);
 assert.equal(voiceBrightness([1,-1],48000),1);
});
test('old generation is rejected',()=>{
 const g=new TurnGate(); const a=g.next();assert.ok(g.accepts(a));const b=g.next();assert.ok(!g.accepts(a));assert.ok(g.accepts(b));
});
test('cancel rejects current generation',()=>{
 const g=new TurnGate();const a=g.next();g.cancel();assert.ok(!g.accepts(a));
});
