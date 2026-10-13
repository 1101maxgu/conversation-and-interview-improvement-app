"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LEVEL_LABELS, LevelBadge } from "@/components/ui/LevelBadge";
import { accountsEnabled, deleteAllData, deleteSavedSession, fetchSavedSessions, useUser } from "@/components/ui/auth";
import { APP_NAME } from "@/components/ui/brand";
import type { SavedSessionSummary } from "@/lib/types";

const minutes = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")} min`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function HistoryPage() {
  const user = useUser();
  return (
    <main className="container" style={{ display: "grid", gap: 16, paddingBlock: "8px 48px" }}>
      <title>{`Your history | ${APP_NAME}`}</title>
      <h1>Your history</h1>
      {!accountsEnabled ? (
        <>
          <p className="muted">Accounts aren&apos;t set up on this site, so sessions are not saved.</p>
          <p>
            <Link href="/" className="btn btn-primary">
              Pick a companion
            </Link>
          </p>
        </>
      ) : user === undefined ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : user === null ? (
        <>
          <p className="muted">Sign in to save your sessions and come back to your notes later.</p>
          <p>
            <Link href="/signin" className="btn btn-primary">
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <History key={user.id} />
      )}
    </main>
  );
}

function History() {
  const [sessions, setSessions] = useState<SavedSessionSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Announced to screen readers after a delete. */
  const [status, setStatus] = useState("");

  const load = useCallback(async (from: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const page = await fetchSavedSessions(from);
      setSessions((prev) => (from && prev ? [...prev, ...page.sessions] : page.sessions));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Runs the first fetch; state is only set after the await.
    void fetchSavedSessions().then(
      (page) => {
        setSessions(page.sessions);
        setCursor(page.nextCursor);
        setBusy(false);
      },
      (err) => {
        setError(message(err));
        setBusy(false);
      },
    );
  }, []);

  async function remove(s: SavedSessionSummary) {
    if (!window.confirm(`Delete the ${s.companionName} session from ${when(s.createdAt)}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSavedSession(s.id);
      setSessions((prev) => prev?.filter((x) => x.id !== s.id) ?? null);
      setStatus("Session deleted.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeAll() {
    if (!window.confirm("Delete every saved session, transcript and set of notes in your account? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAllData();
      setSessions([]);
      setCursor(null);
      setStatus("All your saved sessions were deleted.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="sr-only" role="status">
        {status}
      </p>
      {error && (
        <div className="banner" data-tone="danger" role="alert">
          <p>{error}</p>
          {sessions === null && (
            <button type="button" className="btn" onClick={() => load(null)} style={{ marginTop: 8 }}>
              Try again
            </button>
          )}
        </div>
      )}

      {sessions === null ? (
        !error && (
          <p className="muted" role="status">
            Loading your sessions…
          </p>
        )
      ) : sessions.length === 0 ? (
        <>
          <p className="muted">No saved sessions yet. Finish a session and get your notes: it will show up here.</p>
          <p>
            <Link href="/" className="btn btn-primary">
              Pick a companion
            </Link>
          </p>
        </>
      ) : (
        <ul style={{ display: "grid", gap: 12, listStyle: "none" }}>
          {sessions.map((s) => (
            <li
              key={s.id}
              className="card"
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}
            >
              <div>
                <h2>
                  <Link href={`/results?id=${s.id}`}>{s.companionName}</Link>
                </h2>
                <p className="muted">
                  {when(s.createdAt)}, {minutes(s.durationMs)}, {s.userTurns} {s.userTurns === 1 ? "turn" : "turns"}
                </p>
              </div>
              <div className="actions">
                {s.overall && (
                  <span>
                    <span className="sr-only">Overall: </span>
                    <LevelBadge level={s.overall} />
                  </span>
                )}
                <Link
                  href={`/results?id=${s.id}`}
                  className="btn"
                  aria-label={`Open notes: ${s.companionName}, ${when(s.createdAt)}${s.overall ? `, ${LEVEL_LABELS[s.overall]}` : ""}`}
                >
                  Open notes
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => remove(s)}
                  disabled={busy}
                  aria-label={`Delete session: ${s.companionName}, ${when(s.createdAt)}`}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <p>
          <button type="button" className="btn" onClick={() => load(cursor)} disabled={busy}>
            {busy ? "Loading…" : "Load more"}
          </button>
        </p>
      )}

      {sessions !== null && (
        <section className="card" aria-labelledby="data-heading" style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          <h2 id="data-heading">Your data</h2>
          <p className="muted">
            Saved sessions hold your transcript and notes. Deleting them here removes them from your account for good.
          </p>
          <button type="button" className="btn btn-danger" onClick={removeAll} disabled={busy || sessions.length === 0}>
            Delete all my data
          </button>
        </section>
      )}
    </>
  );
}
