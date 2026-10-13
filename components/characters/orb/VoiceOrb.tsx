"use client";

// A companion, drawn as a voice-reactive orb: a pastel pearl sphere of slowly flowing colour with no face.
// Silent, it drifts. When the companion speaks, the colour flows faster, ripples spread through it, the sphere
// swells a little and small rounded bumps push out of the rim, all following the level of the AI's own audio
// (the `mouthOpen` prop the rig feeds from the speech output, never the microphone).
//
// The picture is drawn by the shared WebGL renderer (renderer.ts). Until its first frame, and whenever WebGL is not
// available, the CSS gradient circle underneath is what you see.
import { useEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import type { AvatarState, Mood, SkinProps } from "@/lib/types";
import { mountOrb, ORB_RADIUS } from "./renderer";
import { BUMP, type OrbSpec } from "./specs";
import css from "./orb.module.css";

/**
 * How each mood looks. Every mood changes four things at once, so it reads at a glance without a face:
 * colour (tint, sat, deep), movement (speed, gain, trem), shape (tight, lean) and texture (spark).
 */
type Look = {
  /** Flow speed and how far the rim bumps push out. */
  speed: number;
  gain: number;
  tint: [number, number, number];
  /** Colour strength (1 = normal) and how dark the deep pockets get (0..1). */
  sat: number;
  deep: number;
  /** A fine tremble on the rim (0..1) and bright specks in the gas (0..1). */
  trem: number;
  spark: number;
  /** Which way the clouds and the light lean, and how much the orb pulls in (0..1). */
  lean: [number, number];
  tight: number;
};
const MOODS: Record<Mood, Look> = {
  neutral: { speed: 1, gain: 1, tint: [1, 1, 1], sat: 1, deep: 0.2, trem: 0, spark: 0, lean: [0, 0], tight: 0 },
  // Warm, quick and bouncy, with a little sparkle.
  happy: { speed: 1.5, gain: 1.4, tint: [1.07, 1.02, 0.92], sat: 1.14, deep: 0, trem: 0, spark: 0.8, lean: [0, 0.12], tight: 0 },
  // Cooler and brighter, leaning in toward you.
  curious: { speed: 1.15, gain: 1.05, tint: [0.95, 1.03, 1.1], sat: 1.08, deep: 0.1, trem: 0, spark: 0.2, lean: [0.3, 0.16], tight: 0 },
  // Deep, slow and pulled in tight.
  serious: { speed: 0.55, gain: 0.5, tint: [0.94, 0.96, 1.03], sat: 0.92, deep: 1, trem: 0, spark: 0, lean: [0, -0.1], tight: 1 },
  // A sudden pop: fast, big and bright.
  surprised: { speed: 1.8, gain: 1.7, tint: [1.05, 1.05, 1.07], sat: 1.12, deep: 0, trem: 0.25, spark: 0.5, lean: [0, 0.2], tight: 0 },
  // Muted and unsettled: washed-out colour and a soft tremble.
  concerned: { speed: 0.75, gain: 0.8, tint: [0.95, 0.96, 0.99], sat: 0.6, deep: 0.55, trem: 1, spark: 0, lean: [-0.12, -0.14], tight: 0.4 },
};
/** How quickly the orb settles into a new mood (per second). */
const MOOD_EASE = 2.5;
const SPEED: Record<AvatarState, number> = { idle: 0.5, listening: 0.3, thinking: 1.7, speaking: 0.8 };

function stillStyle([a, b, c, pearl, deep, accent, accent2]: OrbSpec["colors"]): CSSProperties {
  return {
    background: [
      "radial-gradient(circle at 31% 27%, rgba(255,255,255,.75), transparent 26%)",
      "radial-gradient(circle closest-side, transparent 72%, rgba(255,255,255,.55))",
      `radial-gradient(circle at 22% 52%, ${accent}, transparent 42%)`,
      `radial-gradient(circle at 82% 60%, ${accent2}, transparent 40%)`,
      `radial-gradient(circle at 72% 30%, ${b}, transparent 55%)`,
      `radial-gradient(circle at 30% 75%, ${c}, transparent 55%)`,
      `radial-gradient(circle at 70% 82%, ${deep}, transparent 50%)`,
      `radial-gradient(circle at 45% 45%, ${pearl}, ${a} 60%)`,
    ].join(","),
    boxShadow: `0 0 0.6em ${b}`,
  };
}

export function VoiceOrb({ spec, mouthOpen, state, mood, still = false }: SkinProps & { spec: OrbSpec; still?: boolean }) {
  const live = useRef({ mouthOpen, state, mood });
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    live.current = { mouthOpen, state, mood };
  }, [mouthOpen, state, mood]);

  useEffect(() => {
    if (!canvas.current) return;
    let time = spec.harmonics[0].phase * 7; // each orb starts at a different point in its flow
    let level = 0;
    let think = 0;
    let listen = 0;
    // The current look, eased toward the mood's look so a change of mood glides instead of snapping.
    const start = MOODS[live.current.mood];
    const look: Look = { ...start, tint: [...start.tint], lean: [...start.lean] };
    const frozen = still || reduced;
    return mountOrb(
      canvas.current,
      spec,
      (dt) => {
        const p = live.current;
        const m = MOODS[p.mood];
        const k = Math.min(1, dt * MOOD_EASE);
        for (const key of ["speed", "gain", "sat", "deep", "trem", "spark", "tight"] as const) look[key] += (m[key] - look[key]) * k;
        look.tint = look.tint.map((v, i) => v + (m.tint[i] - v) * k) as Look["tint"];
        look.lean = look.lean.map((v, i) => v + (m.lean[i] - v) * k) as Look["lean"];
        const target = p.state === "speaking" ? Math.max(0, Math.min(1, p.mouthOpen)) : 0;
        // Quick to rise with a syllable, slower to settle, so it pops out and relaxes back.
        level += (target - level) * Math.min(1, dt * (target > level ? 20 : 7));
        think += ((p.state === "thinking" ? 1 : 0) - think) * Math.min(1, dt * 5);
        listen += ((p.state === "listening" ? 1 : 0) - listen) * Math.min(1, dt * 5);
        time += dt * spec.flow * SPEED[p.state] * look.speed * (1 + 5 * level);
        const { sat, deep, trem, spark, tight, tint, lean } = look;
        return { time, level, think, listen, gain: look.gain * BUMP, tint, sat, deep, trem, spark, tight, lean };
      },
      frozen,
    );
  }, [spec, still, reduced]);

  const inset = `${((1 - ORB_RADIUS) / 2) * 100}%`;
  return (
    <span className={css.orb} role="img" aria-label={spec.name}>
      <canvas ref={canvas} className={css.canvas} />
      <span className={css.still} style={{ inset, ...stillStyle(spec.colors) }} />
    </span>
  );
}
