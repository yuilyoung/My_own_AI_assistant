import { useCallback, useEffect, useRef, useState } from "react";
import { Player } from "../../diagnostics/player.mjs";
import sampleUrl from "./audio/narration-ko.mp3";

export function useNarrationPreview(
  enabled: boolean,
  character: string,
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

  async function start() {
    if (!enabled || session.current) return;
    const controller = new AbortController();
    const { signal: cancellation } = controller;
    const current = () => !cancellation.aborted;
    let started = false;
    const player = new Player((level, brightness) => {
      if (!current()) return;
      started ||= level > 0;
      setSignal({ level, brightness, started });
    });
    session.current = { controller, player };
    setFailed(false);
    setSignal({ level: 0, brightness: 0.5, started: false });
    try {
      // Unlock on the user's click, before waiting for the bundled audio.
      await player.unlock();
      if (!current()) return;
      const response = await fetch(sampleUrl, { signal: cancellation });
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
