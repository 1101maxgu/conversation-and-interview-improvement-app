import type { CompanionId, Mood, Skin, SkinProps } from "@/lib/types";
import { ORBS, type OrbSpec } from "./orb/specs";
import { VoiceOrb } from "./orb/VoiceOrb";

// One voice orb per companion, keyed by companion id. To change one, edit its entry in orb/specs.ts.
const anchors = { eyeL: { x: 85, y: 95 }, eyeR: { x: 115, y: 95 }, mouth: { x: 100, y: 115 }, head: { x: 100, y: 60 }, body: { x: 100, y: 100 } };

function orbSkin(spec: OrbSpec): Skin {
  const Component = (props: SkinProps) => <VoiceOrb spec={spec} {...props} />;
  Component.displayName = `Orb(${spec.id})`;
  return { id: spec.id, label: spec.name, viewBox: "0 0 200 200", anchors, Component, selfAnimated: true };
}

export const skins = Object.fromEntries(Object.values(ORBS).map((s) => [s.id, orbSkin(s)])) as Record<CompanionId, Skin>;

/** A companion's orb as a still picture: drawn once, never animated. */
export function StillOrb({ id, mood = "neutral" }: { id: string; mood?: Mood }) {
  const spec = Object.hasOwn(ORBS, id) ? ORBS[id as CompanionId] : ORBS.conversation;
  return <VoiceOrb spec={spec} still mouthOpen={0} blink={false} state="idle" mood={mood} />;
}

export function getSkin(id: string): Skin {
  return Object.hasOwn(skins, id) ? skins[id as CompanionId] : skins.conversation;
}
