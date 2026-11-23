import { useEffect, useMemo, useState } from "react";
import { paintedFeatureImages, type PaintedFaceRig } from "./PaintedFace";
import { loadPortraitImages, portraitImagesReady } from "./portrait-images";

export function usePortraitReady(
  baseImages: readonly string[],
  rig: PaintedFaceRig,
) {
  const urls = useMemo(
    () => [...new Set([...baseImages, ...paintedFeatureImages(rig)])],
    [baseImages, rig],
  );
  const [result, setResult] = useState<{
    urls: readonly string[];
    status: "ready" | "error";
  } | null>(null);
  const ready = portraitImagesReady(urls);

  useEffect(() => {
    if (ready) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout>;
    const showError = () => {
      if (active) setResult({ urls, status: "error" });
    };
    // A late transfer may still finish after the slow-connection notice.
    const timeout = setTimeout(showError, 15000);
    function attempt(canRetry: boolean) {
      void loadPortraitImages(urls).then(
        () => {
          if (active) setResult({ urls, status: "ready" });
        },
        () => {
          if (!active) return;
          if (canRetry) retry = setTimeout(() => attempt(false), 500);
          else showError();
        },
      );
    }
    attempt(true);
    return () => {
      active = false;
      clearTimeout(timeout);
      clearTimeout(retry);
    };
  }, [urls, ready]);

  if (ready) return "ready";
  return result?.urls === urls ? result.status : "loading";
}
