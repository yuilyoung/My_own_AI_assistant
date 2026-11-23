import { act } from "@testing-library/react";
import { vi } from "vitest";

export function motionClock(reduced = false) {
  let elapsed = 0,
    nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacks.delete(id);
  });
  const preference = new EventTarget();
  vi.stubGlobal("matchMedia", () =>
    Object.assign(preference, { matches: reduced }),
  );
  return {
    step(ms: number) {
      act(() => {
        for (let end = elapsed + ms; elapsed < end;) {
          elapsed = Math.min(end, elapsed + 1000 / 60);
          const pending = [...callbacks.values()];
          callbacks.clear();
          for (const cb of pending) cb(elapsed);
        }
      });
    },
    pending: () => callbacks.size,
  };
}
