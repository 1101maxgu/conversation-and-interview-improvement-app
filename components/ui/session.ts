// Client-side data access shared by the pages: the sessionStorage session and the two API calls.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  SESSION_KEY,
  type CompanionPublic,
  type NotesRequest,
  type NotesResult,
  type SessionData,
} from "@/lib/types";

const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function read(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null | undefined): SessionData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data?.companion?.id && Array.isArray(data.companion.groups) ? (data as SessionData) : null;
  } catch {
    return null;
  }
}

/** `undefined` until the browser has hydrated, `null` when there is no usable session. */
export function useSession(): SessionData | null | undefined {
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, read, () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parse(raw)), [raw]);
}

/** Non-reactive read. Browser only: call from event handlers, effects or client-only state initialisers. */
export const readSession = () => parse(read());

/** Throws if storage is unavailable (private mode, quota). */
export function writeSession(data: SessionData) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  listeners.forEach((fn) => fn());
}

// Dev fixtures: add ?mock=1 to a page URL to use mocks/*.json instead of the API.
// Delete this helper, its two callers below, mockSession() and the mocks/ folder after integration.
export function isMock(): boolean {
  return process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("mock");
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : `Something went wrong (error ${res.status}).`);
  }
  return res.json();
}

export async function fetchCompanions(): Promise<CompanionPublic[]> {
  if (isMock()) return (await import("@/mocks/companions.json")).default as CompanionPublic[];
  return api("/api/companions");
}

export async function fetchNotes(body: NotesRequest): Promise<NotesResult> {
  if (isMock()) return (await import("@/mocks/notes.json")).default as NotesResult;
  return api("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A finished demo session so /results?mock=1 renders without talking first. */
export async function mockSession(): Promise<SessionData> {
  const companion = (await fetchCompanions())[0];
  return {
    companionId: companion.id,
    companion,
    selections: {},
    hdVoice: false,
    durationMs: 95_000,
    messages: [
      { role: "assistant", content: "Welcome! Tell me a little about yourself.", t: 0 },
      { role: "user", content: "Sure. I'm a final-year student and I, um, like working with data.", t: 6_000 },
      { role: "assistant", content: "Great. Tell me about a project you're proud of.", t: 21_000 },
      { role: "user", content: "I cleaned a big survey data set and built a dashboard for my department.", t: 30_000 },
    ],
  };
}

export type Loadable<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/** GET /api/companions with a retry function. */
export function useCompanions(): [Loadable<CompanionPublic[]>, () => void] {
  const [state, setState] = useState<Loadable<CompanionPublic[]>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    fetchCompanions().then(
      (data) => live && setState({ status: "ready", data }),
      (err: Error) => live && setState({ status: "error", message: err.message }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };
  return [state, retry];
}
