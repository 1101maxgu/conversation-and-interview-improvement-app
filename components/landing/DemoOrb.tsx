"use client";

// A companion orb running by itself for the landing page: it "speaks" with a made-up voice level, or holds a state.
// The level changes several times a second, so it lives in this small component and nothing around it re-renders.
import { Rig } from "@/components/avatar/Rig";
import type { AvatarState, Mood } from "@/lib/types";
import { useSpeechLevel } from "./useSpeechLevel";

export function DemoOrb({
  id,
  state = "speaking",
  mood = "neutral",
  className,
}: {
  id: string;
  state?: AvatarState;
  mood?: Mood;
  className?: string;
}) {
  const level = useSpeechLevel(state === "speaking");
  return (
    <div className={className} aria-hidden="true">
      <Rig skin={id} state={state} level={level} mood={mood} />
    </div>
  );
}
