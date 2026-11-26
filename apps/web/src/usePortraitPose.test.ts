// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePortraitPose } from "./usePortraitPose";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function controlImages() {
  const requests = new Map<
    string,
    { resolve: () => void; reject: () => void }
  >();
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode() {
        return new Promise<void>((resolve, reject) => {
          requests.set(this.src, { resolve, reject });
        });
      }
    },
  );
  return requests;
}

it("waits for the full pose and reuses decoded artwork on the next cue", async () => {
  const images = controlImages();
  const pair = ["wave-sleeve", "wave-hand"];
  const { result, rerender } = renderHook(
    ({ enabled }) => usePortraitPose(pair, enabled),
    { initialProps: { enabled: true } },
  );
  expect(result.current).toBe(false);
  await act(async () => images.get(pair[0])!.resolve());
  expect(result.current).toBe(false);
  await act(async () => images.get(pair[1])!.resolve());
  expect(result.current).toBe(true);
  rerender({ enabled: false });
  expect(result.current).toBe(false);
  images.clear();
  rerender({ enabled: true });
  expect(result.current).toBe(true);
  expect(images.size).toBe(0);
});

it("keeps a later cue at rest when an earlier pose finishes decoding", async () => {
  const images = controlImages();
  const first = ["old-waving"],
    next = ["new-pointing"];
  const { result, rerender } = renderHook(
    ({ urls }) => usePortraitPose(urls, true),
    { initialProps: { urls: first } },
  );
  rerender({ urls: next });
  await act(async () => images.get(first[0])!.resolve());
  expect(result.current).toBe(false);
  await act(async () => images.get(next[0])!.resolve());
  expect(result.current).toBe(true);
});

it("keeps the resting drawing after a failed load and retries on a fresh cue", async () => {
  const images = controlImages();
  const pose = ["retry-cuff"];
  const { result, rerender } = renderHook(
    ({ cue }) => usePortraitPose(pose, true, cue),
    { initialProps: { cue: {} } },
  );
  const first = images.get(pose[0])!;
  await act(async () => first.reject());
  expect(result.current).toBe(false);
  rerender({ cue: {} });
  expect(images.get(pose[0])).not.toBe(first);
  await act(async () => images.get(pose[0])!.resolve());
  expect(result.current).toBe(true);
});
