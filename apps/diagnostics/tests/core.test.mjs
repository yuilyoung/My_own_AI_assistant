import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TurnGate,mouthLevel} from '../core.mjs';

test('silence closes mouth',()=>assert.equal(mouthLevel(new Float32Array(20)),0));
test('loud audio is clamped',()=>assert.equal(mouthLevel(new Float32Array([1,-1])),1));
test('non-finite samples fail closed',()=>assert.equal(mouthLevel(new Float32Array([NaN])),0));
test('empty audio closes mouth',()=>assert.equal(mouthLevel(new Float32Array()),0));
test('old generation is rejected',()=>{
 const g=new TurnGate(); const a=g.next();assert.ok(g.accepts(a));const b=g.next();assert.ok(!g.accepts(a));assert.ok(g.accepts(b));
});
test('cancel rejects current generation',()=>{
 const g=new TurnGate();const a=g.next();g.cancel();assert.ok(!g.accepts(a));
});
