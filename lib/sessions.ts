// Server-side helpers for the saved-history routes (/api/sessions, /api/account/data).
// Authorisation happens twice: here (verified user, explicit user_id filters) and in the database (row-level security).
// Nothing in this file or its callers logs transcript or notes content: only Postgres error codes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCompanion } from "@/lib/companions";
import { LIMITS, jsonError, rateLimit, sameOrigin } from "@/lib/guard";
import { createClient, getUser, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Level, SavedSession, SavedSessionSummary } from "@/lib/types";

export const TABLE = "sessions";
export const PAGE_SIZE = 20;
/** Only what a SavedSessionSummary needs: no transcript, and just the one field out of the notes JSON. */
export const SUMMARY_COLUMNS = "id, companion_id, duration_ms, user_turns, created_at, overall:notes->>overall";
export const FULL_COLUMNS = "id, companion_id, selections, messages, duration_ms, notes, created_at";

export const NO_STORE = { "Cache-Control": "private, no-store" };

export type Authed = { supabase: SupabaseClient; userId: string };

/**
 * Gate for every history route: 503 when accounts are off, 403 for cross-site writes, 401 when signed out,
 * 429 when over the per-user limit. Returns the user's own Supabase client on success.
 */
export async function requireUser(req: Request): Promise<Authed | Response> {
  // Reading the request first also keeps the GET handlers request-time under cacheComponents (never prerendered).
  if (!sameOrigin(req)) return jsonError(403, "Cross-site requests are not allowed.");
  if (!isSupabaseConfigured()) return jsonError(503, "Accounts are not set up on this site, so there is no saved history.");

  let supabase: SupabaseClient;
  try {
    supabase = await createClient();
  } catch {
    return unavailable();
  }
  const user = await getUser(supabase);
  if (!user) return jsonError(401, "Please sign in to use your history.");

  const limited = await rateLimit(req, "sessions", LIMITS.sessionsPerMin, 60_000, user.id);
  return limited ?? { supabase, userId: user.id };
}

/** Database trouble (free Supabase projects pause when idle). Logs the error code only, never row content. */
export function unavailable(where?: string, error?: { code?: string } | null): Response {
  if (where) console.error(`[sessions] ${where} failed`, error?.code ?? "unknown");
  return jsonError(503, "Your history is unavailable right now. Please try again in a minute.");
}

const LEVELS: Level[] = ["needs-work", "solid", "strong"];

type SummaryRow = {
  id: string;
  companion_id: string;
  duration_ms: number;
  user_turns: number;
  created_at: string;
  overall: string | null;
};

export function toSummary(row: SummaryRow): SavedSessionSummary {
  return {
    id: row.id,
    companionId: row.companion_id as SavedSessionSummary["companionId"],
    companionName: getCompanion(row.companion_id)?.name ?? row.companion_id,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    overall: LEVELS.includes(row.overall as Level) ? (row.overall as Level) : null,
    userTurns: row.user_turns,
  };
}

type FullRow = {
  id: string;
  companion_id: string;
  selections: SavedSession["selections"];
  messages: SavedSession["messages"];
  duration_ms: number;
  notes: SavedSession["notes"];
  created_at: string;
};

export function toSavedSession(row: FullRow): SavedSession {
  return {
    id: row.id,
    companionId: row.companion_id as SavedSession["companionId"],
    selections: row.selections,
    messages: row.messages,
    durationMs: row.duration_ms,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}
