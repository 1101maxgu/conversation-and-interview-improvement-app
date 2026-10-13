import type { CompanionId } from "@/lib/types";

/** One rounded bump travelling round the rim: `k` lobes, moving at `speed` rad/s, up to `amp` of the radius. */
export type Harmonic = { k: number; speed: number; amp: number; phase: number };

export type OrbSpec = {
  id: CompanionId;
  name: string;
  /**
   * Seven colours the liquid blends between: base, second, third, pearl highlight, deepest, then two accents
   * from other hue families. The accents drift through as soft patches, so each orb is a real gradient, not one hue.
   */
  colors: [string, string, string, string, string, string, string];
  /** How it moves: flow speed (1 = normal), ripple rings across the sphere, and which way it swirls. */
  flow: number;
  ripple: number;
  swirl: 1 | -1;
  /** The shape of its voice: which small bumps appear on the rim when it speaks. */
  harmonics: [Harmonic, Harmonic, Harmonic];
};

/** How far the rim bumps push out. One number to turn the whole effect up or down. */
export const BUMP = 1.9;

// Each companion has its own colours and its own way of moving, so they are told apart at a glance.
export const ORBS: Record<CompanionId, OrbSpec> = {
  interview: {
    id: "interview",
    name: "Interview orb",
    colors: ["#8f6bf2", "#e08af0", "#6f8cff", "#fff1f4", "#2c2784", "#ffb59a", "#4fd0e0"],
    flow: 0.9,
    ripple: 9,
    swirl: 1,
    harmonics: [
      { k: 3, speed: 1.9, amp: 0.05, phase: 0.0 },
      { k: 5, speed: -2.6, amp: 0.032, phase: 1.3 },
      { k: 2, speed: 1.1, amp: 0.026, phase: 2.1 },
    ],
  },
  case: {
    id: "case",
    name: "Case orb",
    colors: ["#3fa37a", "#52b8e8", "#2f6fd6", "#e6ffff", "#103f4a", "#b6e36a", "#7f6ff0"],
    flow: 1,
    ripple: 12,
    swirl: -1,
    harmonics: [
      { k: 4, speed: 2.2, amp: 0.046, phase: 0.4 },
      { k: 6, speed: -1.8, amp: 0.028, phase: 2.0 },
      { k: 2, speed: 0.9, amp: 0.026, phase: 0.9 },
    ],
  },
  sales: {
    id: "sales",
    name: "Sales orb",
    colors: ["#f2a24a", "#ff7b4a", "#ffc766", "#fff0d6", "#74301c", "#5f9a5a", "#e0516a"],
    flow: 1.35,
    ripple: 14,
    swirl: 1,
    harmonics: [
      { k: 5, speed: 3.4, amp: 0.05, phase: 0.2 },
      { k: 3, speed: -2.4, amp: 0.036, phase: 1.7 },
      { k: 7, speed: 2.9, amp: 0.02, phase: 0.6 },
    ],
  },
  presentation: {
    id: "presentation",
    name: "Presentation orb",
    colors: ["#f6c445", "#ff8a5c", "#5aa6ff", "#fff6d6", "#5e2a66", "#ff7fb0", "#4fd1b0"],
    flow: 1.1,
    ripple: 7,
    swirl: -1,
    harmonics: [
      { k: 2, speed: 1.4, amp: 0.05, phase: 0.8 },
      { k: 4, speed: -2.1, amp: 0.034, phase: 0.1 },
      { k: 3, speed: 1.7, amp: 0.026, phase: 2.6 },
    ],
  },
  conversation: {
    id: "conversation",
    name: "Conversation orb",
    colors: ["#ff6fb0", "#d85cf0", "#ff8f8a", "#ffe3ee", "#5f1a66", "#7f8cff", "#ffb86a"],
    flow: 0.8,
    ripple: 10,
    swirl: 1,
    harmonics: [
      { k: 2, speed: 2.0, amp: 0.05, phase: 1.0 },
      { k: 3, speed: -1.5, amp: 0.036, phase: 0.3 },
      { k: 5, speed: 2.5, amp: 0.022, phase: 1.9 },
    ],
  },
  friend: {
    id: "friend",
    name: "Friend orb",
    colors: ["#8fcf5a", "#d9ec5a", "#4fc4a0", "#fffbe0", "#1c5238", "#6fb7f0", "#ffc85a"],
    flow: 0.65,
    ripple: 6,
    swirl: -1,
    harmonics: [
      { k: 3, speed: 1.2, amp: 0.044, phase: 0.5 },
      { k: 2, speed: -0.9, amp: 0.034, phase: 2.2 },
      { k: 4, speed: 1.6, amp: 0.022, phase: 1.1 },
    ],
  },
};
