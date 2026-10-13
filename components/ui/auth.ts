// Client-side account state and the saved-history API calls. Everything here is optional: when Supabase is not
// configured `accountsEnabled` is false, useUser() is always null and nothing touches the network.
// The browser session is used for display only; the API routes verify the user again on the server.
import { useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { SavedSession, SavedSessionPage, SessionData } from "@/lib/types";

export const accountsEnabled = isSupabaseConfigured();

export type ClientUser = { id: string; email: string | null };

/** `undefined` while the session is being read, `null` for guests, otherwise the signed-in user. */
export function useUser(): ClientUser | null | undefined {
  const [user, setUser] = useState<ClientUser | null | undefined>(accountsEnabled ? undefined : null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    type MaybeSession = { user?: { id: string; email?: string | null } | null } | null;
    const apply = (session: MaybeSession) => {
      const next = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
      // Keep the same object across token refreshes so effects that depend on the user do not re-run.
      setUser((prev) => (prev && next && prev.id === next.id ? prev : next));
    };
    // Fires on every sign-in, sign-out and token refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    // The first read. If Supabase is unreachable this still settles, as a guest.
    supabase.auth.getSession().then(
      (res) => apply(res.data.session),
      () => apply(null),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return user;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : `Something went wrong (error ${res.status}).`);
  }
  return res.json();
}

/** Saves (or re-saves, same id) a finished session to the signed-in user's history. */
export function saveSession(id: string, s: SessionData): Promise<{ id: string }> {
  return api("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      companionId: s.companionId,
      selections: s.selections,
      messages: s.messages ?? [],
      durationMs: s.durationMs ?? 0,
      notes: s.notes ?? null,
    }),
  });
}

export const fetchSavedSessions = (cursor?: string | null) =>
  api<SavedSessionPage>(`/api/sessions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);

export const fetchSavedSession = (id: string) => api<SavedSession>(`/api/sessions/${encodeURIComponent(id)}`);

export const deleteSavedSession = (id: string) =>
  api<{ deleted: number }>(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });

export const deleteAllData = () => api<{ deleted: number }>("/api/account/data", { method: "DELETE" });
