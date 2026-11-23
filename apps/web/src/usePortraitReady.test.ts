// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePortraitReady } from "./usePortraitReady";
import type { PaintedFaceRig } from "./PaintedFace";

vi.mock("./PaintedFace", () => ({
  paintedFeatureImages: (rig: { images: string[] }) => rig.images,
}));

const rigWith = (...images: string[]) =>
  ({ images }) as unknown as PaintedFaceRig;

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
        return new Promise<void>((resolve, reject) =>
          requests.set(this.src, { resolve, reject }),
        );
      }
    },
  );
  return requests;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("waits for the full illustration and face, even when switching while the first face is loading", async () => {
  const requests = controlImages();
  const base = ["neutral-clothing"];
  const { result, rerender } = renderHook(
    ({ rig }) => usePortraitReady(base, rig),
    { initialProps: { rig: rigWith("first-eyes") } },
  );
  await act(async () => requests.get(base[0])!.resolve());
  expect(result.current).toBe("loading");
  rerender({ rig: rigWith("next-eyes", "next-lips") });
  await act(async () => {
    requests.get("first-eyes")!.resolve();
    requests.get("next-eyes")!.resolve();
  });
  expect(result.current).toBe("loading");
  await act(async () => requests.get("next-lips")!.resolve());
  expect(result.current).toBe("ready");
});

it("retries a failed layer without downloading its already decoded neighbors again", async () => {
  vi.useFakeTimers();
  const requests = controlImages();
  const base = ["retry-head"];
  const rig = rigWith("retry-eye");
  const { result } = renderHook(() => usePortraitReady(base, rig));
  const head = requests.get(base[0]);
  const eye = requests.get("retry-eye")!;
  await act(async () => {
    head!.resolve();
    eye.reject();
  });
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(requests.get(base[0])).toBe(head);
  expect(requests.get("retry-eye")).not.toBe(eye);
  await act(async () => requests.get("retry-eye")!.reject());
  expect(result.current).toBe("error");
});

it("recovers when a slow connection delivers the missing eye after the waiting notice", async () => {
  vi.useFakeTimers();
  const requests = controlImages();
  const base: string[] = [];
  const rig = rigWith("late-eye");
  const { result } = renderHook(() => usePortraitReady(base, rig));
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(result.current).toBe("error");
  await act(async () => requests.get("late-eye")!.resolve());
  expect(result.current).toBe("ready");
});
