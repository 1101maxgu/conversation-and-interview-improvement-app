"use client";

// Design preview: every voice orb in every mood and state. Local only (see ../layout.tsx); delete app/design once approved.
import { useState } from "react";
import { DemoOrb } from "@/components/landing/DemoOrb";
import { MOODS, type AvatarState } from "@/lib/types";

const IDS = ["interview", "case", "sales", "presentation", "conversation", "friend"];
const STATES: AvatarState[] = ["idle", "listening", "thinking", "speaking"];

export default function OrbPreview() {
  const [state, setState] = useState<AvatarState>("speaking");
  const cell = { display: "grid", textAlign: "center", gap: 6, fontSize: 12, color: "var(--muted)" } as const;
  return (
    <main className="container" style={{ display: "grid", gap: 20, paddingBottom: 48 }}>
      <h1 style={{ fontSize: "1.5rem" }}>Voice orbs</h1>
      <div role="group" aria-label="State" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STATES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={state === s} onClick={() => setState(s)}>
            {s}
          </button>
        ))}
      </div>
      {/* Rows are companions, columns are moods. */}
      <section style={{ display: "grid", gridTemplateColumns: `repeat(${MOODS.length}, 1fr)`, gap: 12, background: "var(--surface)", borderRadius: 24, padding: 20 }}>
        {IDS.flatMap((id) =>
          MOODS.map((mood) => (
            <div key={`${id}-${mood}`} style={cell}>
              <DemoOrb id={id} state={state} mood={mood} />
              {id}, {mood}
            </div>
          )),
        )}
      </section>
    </main>
  );
}
