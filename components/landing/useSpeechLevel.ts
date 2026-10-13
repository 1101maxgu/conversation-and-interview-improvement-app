import { useEffect, useState } from "react";
import { useReducedMotion } from "@/components/ui/useReducedMotion";

/**
 * A made-up voice level (0..1) for demo orbs: syllable-like bursts with short gaps while `speaking`.
 * Holds still for people who ask for reduced motion.
 */
export function useSpeechLevel(speaking: boolean): number {
  const [level, setLevel] = useState(0.5);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!speaking || reduced) return;
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setLevel(n % 9 === 0 ? 0.05 : 0.3 + Math.random() * 0.7);
    }, 120);
    return () => clearInterval(timer);
  }, [speaking, reduced]);
  return level;
}
