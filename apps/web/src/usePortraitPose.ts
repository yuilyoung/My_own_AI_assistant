import { useEffect, useReducer } from "react";

import { loadPortraitImages, portraitImagesReady } from "./portrait-images";

// A sleeve and its hand can arrive in separate HTTP responses. The gesture
// clock starts only once both can be painted in the same frame.
export function usePortraitPose(
  urls: readonly string[] | undefined,
  enabled: boolean,
  cue?: object,
) {
  const [, refresh] = useReducer((counter: number) => counter + 1, 0);
  const ready = enabled && (!urls || portraitImagesReady(urls));
  useEffect(() => {
    if (!enabled || !urls || ready) return;
    let current = true;
    void loadPortraitImages(urls).then(
      () => {
        if (current) refresh();
      },
      () => {
        // Keep the resting artwork. A subsequent cue retries failed layers.
      },
    );
    return () => {
      current = false;
    };
  }, [urls, enabled, cue, ready]);
  return ready;
}
