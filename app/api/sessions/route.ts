// Saved history for signed-in users. POST saves (or re-saves) one session, GET lists summaries, newest first.
// The database is always reached with the caller's own Supabase session, so row-level security applies.
import { z } from "zod";
import { getCompanion } from "@/lib/companions";
import { MAX_BODY_BYTES, MAX_SAVED_SESSIONS, jsonError, saveSessionSchema } from "@/lib/guard";
import { NO_STORE, PAGE_SIZE, SUMMARY_COLUMNS, TABLE, requireUser, toSummary, unavailable } from "@/lib/sessions";
import type { SavedSessionPage } from "@/lib/types";

// No segment config: cacheComponents rejects `runtime`/`dynamic` exports. Both handlers read the request first
// (in requireUser), so they always run at request time.

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { supabase, userId } = auth;

  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) return jsonError(413, "Request is too large.");
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return jsonError(413, "Request is too large.");
    body = JSON.parse(text);
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }
  const parsed = saveSessionSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid request.");
  const { id, companionId, selections, messages, durationMs, notes } = parsed.data;
  if (!getCompanion(companionId)) return jsonError(404, "Unknown companion.");

  // A repeat save (after "Regenerate notes") updates the same row and does not count against the cap.
  const existing = await supabase.from(TABLE).select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (existing.error) return unavailable("save (lookup)", existing.error);
  if (!existing.data) {
    // ponytail: check-then-insert, so two simultaneous first saves can overshoot the cap by one. It is a
    // free-tier guard, not a hard quota; move it into a database trigger if it ever has to be exact.
    const { count, error } = await supabase.from(TABLE).select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) return unavailable("save (count)", error);
    if ((count ?? 0) >= MAX_SAVED_SESSIONS) {
      return jsonError(
        409,
        `Your history is full (${MAX_SAVED_SESSIONS} sessions). Delete some older sessions on the History page to save new ones.`,
      );
    }
  }

  // user_id always comes from the verified session, never from the request body. Row-level security rejects
  // anything else, including an id that already belongs to another account.
  const { error } = await supabase.from(TABLE).upsert(
    {
      id,
      user_id: userId,
      companion_id: companionId,
      selections,
      messages,
      duration_ms: Math.round(durationMs),
      user_turns: messages.filter((m) => m.role === "user").length,
      notes: notes ?? null,
    },
    { onConflict: "id" },
  );
  if (error) return unavailable("save", error);

  return Response.json({ id }, { headers: NO_STORE });
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { supabase, userId } = auth;

  // The cursor is the created_at of the last row on the previous page.
  // ponytail: assumes one user never has two rows with the same microsecond timestamp; add id as a tie-breaker if that changes.
  const cursor = new URL(req.url).searchParams.get("cursor");
  if (cursor !== null && !z.iso.datetime({ offset: true }).safeParse(cursor).success) {
    return jsonError(400, "Invalid cursor.");
  }

  let query = supabase
    .from(TABLE)
    .select(SUMMARY_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1); // one extra row tells us whether there is another page
  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error || !data) return unavailable("list", error);

  const rows = data.slice(0, PAGE_SIZE);
  const page: SavedSessionPage = {
    sessions: rows.map(toSummary),
    nextCursor: data.length > PAGE_SIZE ? rows[rows.length - 1].created_at : null,
  };
  return Response.json(page, { headers: NO_STORE });
}
