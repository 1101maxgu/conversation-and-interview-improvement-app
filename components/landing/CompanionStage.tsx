"use client";

// The landing page's companion picker: the cast listed down one side, the chosen companion alive on the other.
// The chosen one runs a small loop of the real product (asks a question, then waits for you).
import Link from "next/link";
import { useEffect, useState } from "react";
import { Character } from "@/components/ui/Character";
import type { CompanionPublic } from "@/lib/types";
import css from "./CompanionStage.module.css";
import { DemoOrb } from "./DemoOrb";

/** One sample opener per companion, shown while it "speaks". Keyed by companion id. */
const SAMPLE_LINES: Record<string, string> = {
  interview: "Tell me about a time a plan fell apart. What did you do next?",
  case: "A coffee chain wants to open in a new city. Where would you start?",
  sales: "Your price is higher than the other quote. Why should I switch?",
  presentation: "What happens to these numbers if demand drops by half?",
  conversation: "So what have you been getting into lately, outside of work?",
  friend: "Hey, how did your week go? Tell me the good part first.",
};

const SPEAK_MS = 4800;
const LISTEN_MS = 2600;
const SKELETON_COUNT = 6;

export function CompanionStage({ companions }: { companions: CompanionPublic[] | null }) {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<"speaking" | "listening">("speaking");

  // Speak, hand the turn over, speak again. Restarts from "speaking" whenever the selection changes.
  useEffect(() => {
    const t = setTimeout(
      () => setPhase((p) => (p === "speaking" ? "listening" : "speaking")),
      phase === "speaking" ? SPEAK_MS : LISTEN_MS,
    );
    return () => clearTimeout(t);
  }, [phase, active]);

  const select = (i: number) => {
    setActive(i);
    setPhase("speaking");
  };

  const current = companions?.[active];
  const speaking = phase === "speaking";

  return (
    <div className={css.panel}>
      <ul className={css.cast} aria-label="Companions">
        {companions
          ? companions.map((c, i) => (
              <li key={c.id}>
                <button type="button" className={css.row} aria-current={i === active ? "true" : undefined} onClick={() => select(i)}>
                  <span className={css.num} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={css.mini} aria-hidden="true">
                    <Character id={c.character} />
                  </span>
                  <span className={css.text}>
                    <span className={css.name}>{c.name}</span>
                    <span className={css.blurb}>{c.blurb}</span>
                  </span>
                </button>
              </li>
            ))
          : Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <li key={i} aria-hidden="true">
                <div className={`skeleton ${css.rowSkeleton}`} />
              </li>
            ))}
      </ul>

      <div className={css.stage}>
        <div className={css.orb}>
          {current ? (
            <DemoOrb key={current.id} id={current.character} state={speaking ? "speaking" : "listening"} />
          ) : (
            <div className={`skeleton ${css.orbSkeleton}`} />
          )}
        </div>
        {/* The sample line is a demo, not content: screen readers get the companion name and blurb instead. */}
        <div className={css.say} aria-hidden="true">
          <span className={css.turn} data-turn={speaking ? "them" : "you"}>
            {speaking ? "Speaking" : "Your turn"}
          </span>
          {current ? (
            <p key={current.id} className={css.line} data-dim={!speaking}>
              &ldquo;{SAMPLE_LINES[current.id] ?? current.blurb}&rdquo;
            </p>
          ) : null}
        </div>
        {current ? (
          <Link href={`/setup/${current.id}`} className="btn btn-primary">
            Start {current.name.toLowerCase()}
          </Link>
        ) : null}
      </div>

      <p className="sr-only" role="status">
        {companions ? (current ? `${current.name} selected` : "") : "Loading companions"}
      </p>
    </div>
  );
}
