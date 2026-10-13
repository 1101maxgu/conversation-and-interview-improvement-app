import { StillOrb } from "@/components/characters";
import type { Mood } from "@/lib/types";

/** A still portrait of a companion's character. Size it with `className` (it fills its box, 1:1). */
export function Character({ id, mood = "neutral", className }: { id: string; mood?: Mood; className?: string }) {
  return (
    <div className={className} style={{ aspectRatio: "1" }}>
      <StillOrb id={id} mood={mood} />
    </div>
  );
}
