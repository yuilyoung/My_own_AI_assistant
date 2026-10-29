import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../player.mjs';

function environment(decode = () => Promise.resolve({})) {
  const sources = [];
  const levels = [];
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.AudioContext = class {
    destination = {};
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    decodeAudioData() {
      return decode();
    }
    createBufferSource() {
      const source = {
        connect() {},
        disconnect() {},
        start() {
          this.started = true;
        },
        stop() {
          this.onended?.();
        },
      };
      sources.push(source);
      return source;
    }
    createAnalyser() {
      return {
        fftSize: 512,
        connect() {},
        disconnect() {},
        getFloatTimeDomainData(data) {
          data.fill(0.1);
        },
      };
    }
  };
  return { sources, levels, player: new Player((level) => levels.push(level)) };
}
async function tick() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('stop during audio decoding never starts a late source', async () => {
  let resolveDecode;
  const { player, sources } = environment(
    () =>
      new Promise((resolve) => {
        resolveDecode = resolve;
      }),
  );
  const playback = player.play(new ArrayBuffer(4), () => true);
  await tick();
  player.stop();
  resolveDecode({});
  await playback;
  assert.equal(sources.length, 0);
  await player.close();
});
test('stop resolves active playback and closes mouth', async () => {
  const { player, sources, levels } = environment();
  const playback = player.play(new ArrayBuffer(4), () => true);
  await tick();
  assert.equal(sources[0].started, true);
  assert.ok(levels.some((v) => v > 0));
  player.stop();
  await playback;
  assert.equal(levels.at(-1), 0);
  await player.close();
});
test('obsolete application generation never starts audio', async () => {
  const { player, sources } = environment();
  await player.play(new ArrayBuffer(4), () => false);
  assert.equal(sources.length, 0);
  await player.close();
});
