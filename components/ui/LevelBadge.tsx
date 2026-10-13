import type { Level } from "@/lib/types";

export const LEVEL_LABELS: Record<Level, string> = {
  "needs-work": "Needs work",
  solid: "Solid",
  strong: "Strong",
};

export function LevelBadge({ level }: { level: Level }) {
  return (
    <span className="level" data-level={level}>
      {LEVEL_LABELS[level] ?? LEVEL_LABELS.solid}
    </span>
  );
}
