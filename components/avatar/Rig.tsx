"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getSkin } from "@/components/characters";
import type { AvatarState, Mood, Skin, SkinProps } from "@/lib/types";
import { smoothLevel } from "@/lib/voice/text";
import css from "./Rig.module.css";

export type RigProps = {
  /** Skin id (`companion.character`). Unknown ids fall back to a built-in placeholder face. */
  skin: string;
  state: AvatarState;
  /** Raw speech level 0-1. The rig smooths it into mouth openness. */
  level: number;
  mood: Mood;
  /** Width in px or any CSS length. Default: fill the parent. */
  size?: number | string;
  /** Makes the avatar a button (used for tap-to-interrupt). */
  onClick?: () => void;
  /** Accessible name when clickable. */
  label?: string;
  /**
   * Slot for a future realistic avatar (video or 3D head driven by the same state/level/mood).
   * Only "cartoon" exists today: "realistic" is accepted and renders the cartoon skin.
   */
  style?: "cartoon" | "realistic";
};

const MOUTH_FRAME_MS = 33; // mouth re-renders at most ~30 times a second
const BLINK_MS = 120;

function Placeholder({ mouthOpen, blink }: SkinProps) {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label="Companion">
      <circle cx="100" cy="100" r="78" fill="#ffd9a8" stroke="#3a2a26" strokeWidth="4" />
      {[72, 128].map((x) => (
        <ellipse key={x} cx={x} cy="86" rx="8" ry={blink ? 1 : 10} fill="#3a2a26" />
      ))}
      <ellipse cx="100" cy="134" rx="20" ry={3 + mouthOpen * 16} fill="#3a2a26" />
    </svg>
  );
}

const PLACEHOLDER: Skin = {
  id: "placeholder",
  label: "Companion",
  viewBox: "0 0 200 200",
  anchors: {
    eyeL: { x: 72, y: 86 },
    eyeR: { x: 128, y: 86 },
    mouth: { x: 100, y: 134 },
    head: { x: 100, y: 100 },
    body: { x: 100, y: 170 },
  },
  Component: Placeholder,
};

function resolveSkin(id: string): Skin {
  try {
    return getSkin(id) ?? PLACEHOLDER;
  } catch {
    return PLACEHOLDER;
  }
}

export function Rig({ skin, state, level, mood, size, onClick, label }: RigProps) {
  const { Component, viewBox, anchors, selfAnimated } = useMemo(() => resolveSkin(skin), [skin]);
  const [mouth, setMouth] = useState(0);
  const [blink, setBlink] = useState(false);

  const target = useRef(0);
  useEffect(() => {
    target.current = state === "speaking" ? level : 0;
  }, [level, state]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let painted = 0;
    let value = 0;
    const tick = (now: number) => {
      value = smoothLevel(value, target.current, now - last);
      last = now;
      if (now - painted >= MOUTH_FRAME_MS) {
        painted = now;
        setMouth(Math.round(value * 20) / 20); // quantised: React skips the render when unchanged
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let open: ReturnType<typeof setTimeout>;
    let close: ReturnType<typeof setTimeout>;
    const schedule = () => {
      open = setTimeout(
        () => {
          setBlink(true);
          close = setTimeout(() => setBlink(false), BLINK_MS);
          schedule();
        },
        2000 + Math.random() * 4000,
      );
    };
    schedule();
    return () => {
      clearTimeout(open);
      clearTimeout(close);
    };
  }, []);

  // Eyes drift for a moment now and then while idle or listening, so the character looks alive, then return.
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (state !== "idle" && state !== "listening") return;
    let away: ReturnType<typeof setTimeout>;
    let back: ReturnType<typeof setTimeout>;
    const schedule = () => {
      away = setTimeout(
        () => {
          setGaze({ x: Math.random() * 1.6 - 0.8, y: Math.random() * 0.8 - 0.4 });
          back = setTimeout(() => setGaze({ x: 0, y: 0 }), 700 + Math.random() * 600);
          schedule();
        },
        2600 + Math.random() * 3800,
      );
    };
    schedule();
    return () => {
      clearTimeout(away);
      clearTimeout(back);
    };
  }, [state]);
  const looking = state === "idle" || state === "listening" ? gaze : undefined;

  // Squash and stretch with the voice: louder is taller and narrower. Width shrinks as height grows, so the
  // body keeps its volume and never looks inflated.
  const stretch: CSSProperties = { transform: `scale(${1 - 0.045 * mouth}, ${1 + 0.07 * mouth})` };

  // Thinking dots sit up and to the right of the head anchor, in viewBox-relative percentages.
  const [, , vbW = 200, vbH = 200] = viewBox.split(/[\s,]+/).map(Number);
  const dots: CSSProperties = {
    left: `${Math.min(80, (anchors.head.x / vbW) * 100 + 22)}%`,
    top: `${Math.max(2, (anchors.head.y / vbH) * 100 - 40)}%`,
  };

  const body = selfAnimated ? (
    // The voice orbs draw their own motion from the same level, state and mood.
    <span className={css.plain} style={{ aspectRatio: `${vbW} / ${vbH}` }}>
      <Component mouthOpen={mouth} blink={blink} state={state} mood={mood} gaze={looking} />
    </span>
  ) : (
    <span className={`${css.pose} ${css[state]}`} style={{ aspectRatio: `${vbW} / ${vbH}` }}>
      <span className={css.breathe}>
        <span className={css.stretch} style={stretch}>
          <Component mouthOpen={mouth} blink={blink} state={state} mood={mood} gaze={looking} />
        </span>
      </span>
      {state === "thinking" && (
        <span className={css.dots} style={dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );

  const width = typeof size === "number" ? `${size}px` : (size ?? "100%");
  return onClick ? (
    <button type="button" className={css.rig} style={{ width }} onClick={onClick} aria-label={label}>
      {body}
    </button>
  ) : (
    <span className={css.rig} style={{ width }}>
      {body}
    </span>
  );
}

export default Rig;
