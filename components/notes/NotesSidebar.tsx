"use client";

import { useEffect, useRef, useState } from "react";
import type { NoteCard, NoteTag } from "@/lib/types";
import styles from "./NotesSidebar.module.css";

export const PINS_KEY = "session:v1:pins";

const TAG_LABELS: Record<NoteTag, string> = { strength: "Strength", improve: "To improve", tip: "Tip" };
const TAGS = Object.keys(TAG_LABELS) as NoteTag[];

function readPins(): string[] {
  try {
    const pins = JSON.parse(sessionStorage.getItem(PINS_KEY) ?? "[]");
    return Array.isArray(pins) ? pins : [];
  } catch {
    return [];
  }
}

/**
 * Right-hand panel on desktop; on mobile a bottom sheet opened by a floating button.
 * Render it only in the browser (it reads pin state from sessionStorage on mount).
 */
export function NotesSidebar({ notes }: { notes: NoteCard[] }) {
  const [pins, setPins] = useState(readPins);
  const [filter, setFilter] = useState<NoteTag | "all">("all");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Opening the sheet moves focus into it; close() hands it back to the toggle.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  function togglePin(id: string) {
    const next = pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
    setPins(next);
    try {
      sessionStorage.setItem(PINS_KEY, JSON.stringify(next));
    } catch {
      // Pins just won't survive a reload.
    }
  }

  const toggleExpanded = (id: string) =>
    setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  // Array.sort is stable, so pinned notes float up and everything else keeps the server's order.
  const visible = notes
    .filter((n) => filter === "all" || n.tags.includes(filter))
    .sort((a, b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)));

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className={`btn btn-primary ${styles.toggle}`}
        aria-expanded={open}
        aria-controls="notes-panel"
        onClick={() => setOpen(true)}
      >
        Notes ({notes.length})
      </button>

      <aside
        id="notes-panel"
        className={styles.panel}
        data-open={open}
        aria-labelledby="notes-heading"
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) close();
        }}
      >
        <div className={styles.head}>
          <h2 id="notes-heading">Notes</h2>
          <button ref={closeRef} type="button" className={`btn btn-ghost ${styles.close}`} onClick={close}>
            Close
          </button>
        </div>

        {notes.length === 0 ? (
          <p className="muted">No notes this time. Try a slightly longer session to get more feedback.</p>
        ) : (
          <>
            <div className={styles.filters} role="group" aria-label="Filter notes by tag">
              {(["all", ...TAGS] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip ${styles.filter}`}
                  aria-pressed={filter === t}
                  onClick={() => setFilter(t)}
                >
                  {t === "all" ? "All" : TAG_LABELS[t]}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="muted">No notes with this tag.</p>
            ) : (
              <ul className={styles.list}>
                {visible.map((n) => {
                  const pinned = pins.includes(n.id);
                  const isOpen = expanded.includes(n.id);
                  // ponytail: length heuristic for "longer than two lines"; measure with a ref if it misfires.
                  const long = n.body.length > 90;
                  return (
                    <li key={n.id} className={styles.note} data-pinned={pinned}>
                      <div className={styles.noteHead}>
                        <h3>{n.title}</h3>
                        <button
                          type="button"
                          className={`chip ${styles.pin}`}
                          aria-pressed={pinned}
                          aria-label={`Pin note: ${n.title}`}
                          onClick={() => togglePin(n.id)}
                        >
                          Pin
                        </button>
                      </div>
                      <ul className={styles.tags} aria-label="Tags">
                        {n.tags.map((t) => (
                          <li key={t} className={styles.tag} data-tag={t}>
                            {TAG_LABELS[t] ?? t}
                          </li>
                        ))}
                      </ul>
                      {/* The click on the text is a mouse shortcut; the button below is the keyboard path. */}
                      <p
                        id={`note-${n.id}`}
                        className={styles.body}
                        data-clamped={long && !isOpen}
                        onClick={long ? () => toggleExpanded(n.id) : undefined}
                      >
                        {n.body}
                      </p>
                      {long && (
                        <button
                          type="button"
                          className={styles.more}
                          aria-expanded={isOpen}
                          aria-controls={`note-${n.id}`}
                          onClick={() => toggleExpanded(n.id)}
                        >
                          {isOpen ? "Show less" : "Show more"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </aside>
    </>
  );
}
