import { useCallback, useEffect, useRef, useState } from "react";
import { Player } from "../../diagnostics/player.mjs";
import type { AvatarCharacter } from "./avatar-cast";
import hanaGreeting from "./audio/hana-greeting.mp3";
import hanaIntro from "./audio/hana-intro.mp3";
import isolGreeting from "./audio/isol-greeting.mp3";
import isolIntro from "./audio/isol-intro.mp3";
import seorinGreeting from "./audio/seorin-greeting.mp3";
import seorinIntro from "./audio/seorin-intro.mp3";

const samples = {
  hana: { greeting: hanaGreeting, intro: hanaIntro },
  isol: { greeting: isolGreeting, intro: isolIntro },
  seorin: { greeting: seorinGreeting, intro: seorinIntro },
};
export type SpeechSample = keyof (typeof samples)["hana"];

export function useNarrationPreview(
  enabled: boolean,
  character: AvatarCharacter | "live2d",
  cue?: object,
) {
  const session = useRef<{
    controller: AbortController;
    player: Player;
  } | null>(null);
  const [signal, setSignal] = useState<{
    level: number;
    brightness: number;
    started: boolean;
    sample: SpeechSample;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  const stop = useCallback(() => {
    const previous = session.current;
    if (!previous) return;
    session.current = null;
    previous.controller.abort();
    void previous.player.close().catch(() => {});
    setSignal(null);
  }, []);
  useEffect(() => stop, [character, cue, enabled, stop]);
  useEffect(() => {
    window.addEventListener("pagehide", stop);
    return () => window.removeEventListener("pagehide", stop);
  }, [stop]);

  async function start(sample: SpeechSample) {
    if (!enabled || character === "live2d") return;
    stop();
    const controller = new AbortController();
    const { signal: cancellation } = controller;
    const current = () => !cancellation.aborted;
    let started = false;
    const player = new Player((level, brightness) => {
      if (!current()) return;
      started ||= level > 0;
      setSignal({ level, brightness, started, sample });
    });
    session.current = { controller, player };
    setFailed(false);
    setSignal({ level: 0, brightness: 0.5, started: false, sample });
    try {
      // Unlock on the user's click, before waiting for the bundled audio.
      await player.unlock();
      if (!current()) return;
      const response = await fetch(samples[character][sample], {
        signal: cancellation,
      });
      if (!response.ok) throw new Error("Unable to load narration sample");
      const bytes = await response.arrayBuffer();
      if (current()) await player.play(bytes, current);
    } catch {
      if (current()) setFailed(true);
    } finally {
      if (current()) stop();
    }
  }

  return { signal, failed, start, stop };
}
