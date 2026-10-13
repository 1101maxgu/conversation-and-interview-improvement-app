"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NotesSidebar, PINS_KEY } from "@/components/notes/NotesSidebar";
import { Character } from "@/components/ui/Character";
import { LEVEL_LABELS, LevelBadge } from "@/components/ui/LevelBadge";
import { accountsEnabled, fetchSavedSession, saveSession, useUser } from "@/components/ui/auth";
import { APP_NAME } from "@/components/ui/brand";
import {
  fetchNotes,
  isMock,
  mockSession,
  readSession,
  useCompanions,
  useSession,
  writeSession,
  type Loadable,
} from "@/components/ui/session";
import type { CompanionPublic, NotesResult, SavedSession, SessionData } from "@/lib/types";
import styles from "./page.module.css";

const MAX_NOTES_CALLS = 2;

const percent = (ratio: number) => Math.round(Math.min(1, Math.max(0, ratio || 0)) * 100);
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const sortedFillers = (fillers: Record<string, number>) => Object.entries(fillers).sort((a, b) => b[1] - a[1]);

/** What the notes view needs: a live session from sessionStorage or a saved one from the account's history. */
type ViewSession = Pick<SessionData, "companionId" | "durationMs" | "messages"> & {
  companion: Pick<CompanionPublic, "name" | "character">;
};

function toMarkdown(session: ViewSession, notes: NotesResult): string {
  const { name } = session.companion;
  const { stats } = notes;
  const you = percent(stats.talkRatio);
  const fillers = sortedFillers(stats.fillers)
    .map(([word, n]) => `${word} ${n}`)
    .join(", ");
  return [
    `# ${APP_NAME} session: ${name}`,
    `Length: ${clock(session.durationMs ?? 0)}`,
    "",
    "## Summary",
    notes.summary,
    "",
    `Overall: ${LEVEL_LABELS[notes.overall]}`,
    "",
    "## How you did",
    ...notes.dimensions.map((d) => `- ${d.label}: ${LEVEL_LABELS[d.level]}. ${d.reason}`),
    "",
    "## Stats",
    `- Pace: ${stats.wpm} words per minute (${stats.userWords} words spoken)`,
    `- Filler words: ${stats.fillerCount}${fillers ? ` (${fillers})` : ""}`,
    `- Share of talking: you ${you}%, ${name} ${100 - you}%`,
    "",
    "## Notes",
    ...notes.notes.flatMap((n) => [`### ${n.title} [${n.tags.join(", ")}]`, n.body, ""]),
    "## Transcript",
    ...(session.messages ?? []).map((m) => `[${clock(m.t)}] ${m.role === "user" ? "You" : name}: ${m.content}`),
    "",
  ].join("\n");
}

function download(session: ViewSession, notes: NotesResult) {
  const url = URL.createObjectURL(new Blob([toMarkdown(session, notes)], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${APP_NAME.toLowerCase()}-${session.companionId}-notes.md`;
  a.click();
  URL.revokeObjectURL(url);
}

const title = <title>{`Your notes | ${APP_NAME}`}</title>;

// Reading the query string needs a Suspense boundary so the rest of the page can be prerendered.
export default function ResultsPage() {
  return (
    <Suspense fallback={<main className="container">{title}</main>}>
      <Results />
    </Suspense>
  );
}

/** /results shows the session that just ended; /results?id=<uuid> opens a saved one read-only. */
function Results() {
  const id = useSearchParams().get("id");
  const session = useSession();
  // Keyed by session and length: this page's state outlives navigation, and a new or resumed session needs new notes.
  return id ? <SavedResults key={id} id={id} /> : <LiveResults key={`${session?.sessionId}.${session?.durationMs}`} />;
}

function LiveResults() {
  const router = useRouter();
  const session = useSession();
  const user = useUser();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Survives the StrictMode double effect, so arriving here costs exactly one /api/notes call.
  const requested = useRef(false);
  // The notesCalls value a save was last started for: one save per set of notes, even under StrictMode.
  const saveStarted = useRef<number | null>(null);

  const hasTranscript = Boolean(session?.messages?.length);
  const noNotes = session?.companion.notes === false;
  const notes = session?.notes;
  const calls = session?.notesCalls ?? 0;

  const request = useCallback(async (s: SessionData) => {
    try {
      const result = await fetchNotes({
        companionId: s.companionId,
        selections: s.selections,
        plan: s.plan,
        messages: s.messages ?? [],
        durationMs: s.durationMs ?? 0,
      });
      sessionStorage.removeItem(PINS_KEY); // pins belong to the previous set of notes
      writeSession({ ...s, notes: result, notesCalls: (s.notesCalls ?? 0) + 1 });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (noNotes) return router.replace("/goodbye");
    if (!hasTranscript) {
      if (session === null && isMock()) mockSession().then(writeSession);
      return;
    }
    if (session && !session.notes && !requested.current) {
      requested.current = true;
      request(session);
    }
  }, [session, noNotes, hasTranscript, router, request]);

  // Signed-in users only: save once the notes exist, and again (same id, same row) after a regenerate.
  // Fire and forget: a failed save never blocks or changes the rest of the results page.
  useEffect(() => {
    if (!user || !session?.notes || !session.messages?.length || isMock()) return;
    const savedFor = session.notesCalls ?? 0;
    if (session.savedNotesCalls === savedFor || saveStarted.current === savedFor) return;
    saveStarted.current = savedFor;
    const id = session.savedId ?? crypto.randomUUID();
    saveSession(id, session).then(
      () => {
        setSaveError(null);
        // Re-read: a regenerate may have landed while the save was in flight.
        const current = readSession();
        if (current?.messages?.length) writeSession({ ...current, savedId: id, savedNotesCalls: savedFor });
      },
      (err: unknown) => setSaveError(err instanceof Error ? err.message : "Something went wrong."),
    );
  }, [user, session]);

  function retry() {
    if (!session) return;
    setError(null);
    setBusy(true);
    request(session);
  }

  // Lives outside the state branches so the announcement fires when the notes arrive.
  const announce = (
    <p className="sr-only" aria-live="polite">
      {notes ? `Your notes are ready. ${notes.notes.length} notes.` : ""}
    </p>
  );

  if (session === undefined || noNotes) return <main className="container">{title}</main>;

  if (!session || !hasTranscript) {
    return (
      <main className="container stage">
        {title}
        <Character id={session?.companion.character ?? "conversation"} mood="curious" className="stage-character" />
        <h1>Nothing to review yet</h1>
        <p className="muted">Have a conversation first, then your notes will show up here.</p>
        <Link href="/" className="btn btn-primary">
          Pick a companion
        </Link>
      </main>
    );
  }

  const { companion } = session;
  const nav = (
    <>
      <Link href={`/setup/${session.companionId}`} className="btn">
        Practise again
      </Link>
      <Link href="/" className="btn btn-ghost">
        Home
      </Link>
    </>
  );

  if (!notes) {
    return (
      <main className="container stage">
        {title}
        {announce}
        <Character id={companion.character} mood={error ? "serious" : "curious"} className="stage-character" />
        {error ? (
          <>
            <h1>We couldn&apos;t get your notes</h1>
            <p className="banner" data-tone="danger" role="alert">
              {error}
            </p>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={retry}>
                Try again
              </button>
              {nav}
            </div>
          </>
        ) : (
          <>
            <h1>Writing your notes</h1>
            <p className="muted" role="status">
              {companion.name} is reading back through your conversation. This usually takes a few seconds.
            </p>
            <div className={styles.loading} aria-hidden="true">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          </>
        )}
      </main>
    );
  }

  const left = MAX_NOTES_CALLS - calls;
  const saved = session.savedNotesCalls === calls;

  return (
    <NotesView
      session={session}
      notes={notes}
      announce={announce}
      error={error}
      sidebarKey={calls}
      status={
        user && (saved || saveError) ? (
          <p className="muted" role="status">
            {saved ? "Saved to your history. " : `Couldn't save to your history. ${saveError}`}
            {saved && <Link href="/history">View history</Link>}
          </p>
        ) : null
      }
    >
      <button type="button" className="btn btn-primary" onClick={() => download(session, notes)}>
        Download transcript + notes
      </button>
      {nav}
      {left > 0 && (
        <button type="button" className="btn btn-ghost" onClick={retry} disabled={busy}>
          {busy ? "Regenerating…" : `Regenerate notes (${left} left)`}
        </button>
      )}
    </NotesView>
  );
}

/** A session opened from the account's history. Read-only: no regenerate, no auto-save. */
function SavedResults({ id }: { id: string }) {
  const user = useUser();
  const [companions] = useCompanions();
  const [state, setState] = useState<Loadable<SavedSession>>({ status: "loading" });
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchSavedSession(id).then(
      (data) => live && setState({ status: "ready", data }),
      (err: Error) => live && setState({ status: "error", message: err.message }),
    );
    return () => {
      live = false;
    };
  }, [id, userId]);

  const back = (
    <Link href="/history" className="btn">
      Back to history
    </Link>
  );

  if (!accountsEnabled || user === null) {
    return (
      <main className="container stage">
        {title}
        <h1>Sign in to open this session</h1>
        <p className="muted">Saved sessions are only visible to the account that saved them.</p>
        <div className="actions">
          {accountsEnabled && (
            <Link href="/signin" className="btn btn-primary">
              Sign in
            </Link>
          )}
          <Link href="/" className="btn">
            Home
          </Link>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="container stage">
        {title}
        <h1>We couldn&apos;t open that session</h1>
        <p className="banner" data-tone="danger" role="alert">
          {state.message}
        </p>
        <div className="actions">{back}</div>
      </main>
    );
  }

  if (state.status === "loading" || companions.status === "loading") {
    return (
      <main className="container stage">
        {title}
        <p className="muted" role="status">
          Loading your saved session…
        </p>
      </main>
    );
  }

  const saved = state.data;
  // If the companion list failed to load or the companion was since removed, fall back to its id and a default character.
  const known = companions.status === "ready" ? companions.data.find((c) => c.id === saved.companionId) : undefined;
  const session: ViewSession = {
    companionId: saved.companionId,
    companion: known ?? { name: saved.companionId, character: "conversation" },
    durationMs: saved.durationMs,
    messages: saved.messages,
  };
  const { notes } = saved;

  if (!notes) {
    return (
      <main className="container stage">
        {title}
        <h1>No notes were saved for this session</h1>
        <div className="actions">{back}</div>
      </main>
    );
  }

  const savedAt = new Date(saved.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <NotesView session={session} notes={notes} sidebarKey={id} status={<p className="muted">Saved {savedAt}.</p>}>
      <button type="button" className="btn btn-primary" onClick={() => download(session, notes)}>
        Download transcript + notes
      </button>
      {back}
      <Link href={`/setup/${saved.companionId}`} className="btn btn-ghost">
        Practise again
      </Link>
    </NotesView>
  );
}

/** The notes page itself, shared by the live and the saved view. `children` are the action buttons. */
function NotesView({
  session,
  notes,
  announce,
  error,
  status,
  sidebarKey,
  children,
}: {
  session: ViewSession;
  notes: NotesResult;
  announce?: ReactNode;
  error?: string | null;
  status?: ReactNode;
  sidebarKey: string | number;
  children: ReactNode;
}) {
  const { companion } = session;
  const { stats } = notes;
  const you = percent(stats.talkRatio);
  const fillers = sortedFillers(stats.fillers);

  return (
    <main className={`container ${styles.layout}`}>
      {title}
      {announce}
      <div className={styles.main}>
        <header className={styles.header}>
          <Character id={companion.character} mood="happy" className={styles.character} />
          <div>
            <h1>Your notes</h1>
            <p className="muted">
              {companion.name}, {clock(session.durationMs ?? 0)} min
            </p>
          </div>
        </header>

        <section className={`card ${styles.section}`} aria-labelledby="summary-heading">
          <div className={styles.row}>
            <h2 id="summary-heading">Summary</h2>
            <span>
              <span className="sr-only">Overall: </span>
              <LevelBadge level={notes.overall} />
            </span>
          </div>
          <p>{notes.summary}</p>
        </section>

        {notes.dimensions.length > 0 && (
          <section className={`card ${styles.section}`} aria-labelledby="dimensions-heading">
            <h2 id="dimensions-heading">How you did</h2>
            <ul className={styles.dimensions}>
              {notes.dimensions.map((d) => (
                <li key={d.label}>
                  <div className={styles.row}>
                    <h3>{d.label}</h3>
                    <LevelBadge level={d.level} />
                  </div>
                  <p className="muted">{d.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`card ${styles.section}`} aria-labelledby="stats-heading">
          <h2 id="stats-heading">Stats</h2>
          <dl className={styles.stats}>
            <div>
              <dt>Pace</dt>
              <dd>
                <strong>{stats.wpm}</strong> words per minute
                <span className="muted"> ({stats.userWords} words spoken)</span>
              </dd>
            </div>
            <div>
              <dt>Filler words</dt>
              <dd>
                <strong>{stats.fillerCount}</strong>
                {fillers.length > 0 ? " in total" : " spotted. Nice and clean."}
                {fillers.length > 0 && (
                  <ul className={styles.fillers}>
                    {fillers.map(([word, n]) => (
                      <li key={word}>
                        {word} <span aria-hidden="true">×</span> {n}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt>Share of talking</dt>
              <dd>
                <div
                  className={styles.ratio}
                  role="img"
                  aria-label={`You spoke ${you}% of the words, ${companion.name} ${100 - you}%.`}
                >
                  <div style={{ width: `${you}%` }} />
                </div>
                <div className={styles.row} aria-hidden="true">
                  <span>You {you}%</span>
                  <span className="muted">
                    {companion.name} {100 - you}%
                  </span>
                </div>
              </dd>
            </div>
          </dl>
        </section>

        {error && (
          <p className="banner" data-tone="danger" role="alert">
            {error}
          </p>
        )}
        {status}
        <div className={`actions ${styles.actions}`}>{children}</div>
      </div>

      {/* The key remounts the sidebar after a regenerate so it drops the old pins. */}
      <NotesSidebar key={sidebarKey} notes={notes.notes} />
    </main>
  );
}
