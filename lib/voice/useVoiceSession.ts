"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SessionData, Voice } from "@/lib/types";
import { getVoice } from "@/lib/voices";
import { VoiceSession } from "./session";

const DEFAULT_VOICE: Voice = { id: "default", label: "Default", kokoroVoice: "af_heart", browserVoiceHints: [] };

function resolveVoice(id: string): Voice {
  try {
    return getVoice(id) ?? DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

/**
 * Single source of truth for a live session. Returns the current snapshot (state, transcript, flags)
 * plus the `session` object whose methods drive it: start, sendText, sendNow, interrupt, retry,
 * setMode, pttDown/pttUp, setMuted, setVolume, end.
 */
export function useVoiceSession(data: SessionData) {
  const [session] = useState(() => new VoiceSession(data, resolveVoice(data.companion.voiceId)));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    const onVisibility = () => (document.hidden ? session.pause() : session.resume());
    const onHide = () => session.pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      // Leaving mid-session ends it, so coming back shows the end page (with Resume) instead of a dead session.
      if (session.getSnapshot().started) session.end();
      else session.destroy();
    };
  }, [session]);

  return { ...snapshot, session };
}

const zero = () => 0;

/** Mouth level 0-1. Separate from the snapshot so ~30 updates a second only re-render the avatar. */
export function useVoiceLevel(session: VoiceSession): number {
  return useSyncExternalStore(session.subscribeLevel, session.getLevel, zero);
}
