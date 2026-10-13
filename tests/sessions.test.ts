import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/supabase/server is mocked: no project, no network. `db` is a fake query builder that records every call
// and answers from a queue, so the tests can assert exactly what would have been sent to the database.
const mocks = vi.hoisted(() => {
  type Result = { data?: unknown; error?: { code: string; message?: string } | null; count?: number | null };
  const state = {
    configured: true,
    user: null as { id: string; email: string | null } | null,
    calls: [] as { table: string; ops: [string, ...unknown[]][] }[],
    results: [] as Result[],
  };
  function from(table: string) {
    const call = { table, ops: [] as [string, ...unknown[]][] };
    state.calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "lt", "order", "limit", "upsert", "delete", "maybeSingle"]) {
      builder[op] = (...args: unknown[]) => {
        call.ops.push([op, ...args]);
        return builder;
      };
    }
    // Awaiting the builder runs the "query": take the next queued result.
    builder.then = (resolve: (r: Result) => unknown) => resolve({ data: null, error: null, count: null, ...state.results.shift() });
    return builder;
  }
  return { state, from };
});

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => mocks.state.configured,
  createClient: async () => ({ from: mocks.from }),
  getUser: async () => mocks.state.user,
}));
vi.mock("@/lib/companions", () => ({
  getCompanion: (id: string) =>
    ["conversation", "interview", "sales", "case", "friend", "presentation"].includes(id) ? { id, name: `${id} companion` } : undefined,
}));

import { DELETE as deleteAll } from "@/app/api/account/data/route";
import { DELETE as deleteOne, GET as getOne } from "@/app/api/sessions/[id]/route";
import { GET as list, POST as save } from "@/app/api/sessions/route";
import { MAX_SAVED_SESSIONS } from "@/lib/guard";

const { state } = mocks;
const USER = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com" };
const ID = "3f2b8c1e-5d47-4a9b-8c6f-0e1d2a3b4c5d";
const SECRET = "my salary expectation is confidential";

const notes = {
  summary: "Clear answers.",
  overall: "strong",
  dimensions: [{ label: "Structure", level: "strong", reason: "You led with the result." }],
  notes: [{ id: "n1", title: "Clear result", body: "Keep leading with outcomes.", tags: ["strength"] }],
  stats: { userWords: 34, wpm: 120, fillerCount: 4, fillers: { um: 1 }, talkRatio: 0.7 },
};
const body = {
  id: ID,
  companionId: "interview",
  selections: { type: "behavioral" },
  messages: [
    { role: "assistant", content: "Tell me about yourself.", t: 1000 },
    { role: "user", content: SECRET, t: 5000 },
    { role: "user", content: "And I led a team of four.", t: 9000 },
  ],
  durationMs: 30_000.4,
  notes,
};

const request = (method: string, path: string, json?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: json === undefined ? undefined : typeof json === "string" ? json : JSON.stringify(json),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ops = (i: number) => state.calls[i].ops;
const op = (i: number, name: string) => ops(i).find((o) => o[0] === name);

/** Every route, called once. */
const everyRoute = () => [
  save(request("POST", "/api/sessions", body)),
  list(request("GET", "/api/sessions")),
  getOne(request("GET", `/api/sessions/${ID}`), ctx(ID)),
  deleteOne(request("DELETE", `/api/sessions/${ID}`), ctx(ID)),
  deleteAll(request("DELETE", "/api/account/data")),
];

beforeEach(() => {
  state.configured = true;
  state.user = USER;
  state.calls.length = 0;
  state.results.length = 0;
});

describe("history routes: access", () => {
  it("answers 401 when signed out, without touching the database", async () => {
    state.user = null;
    for (const res of await Promise.all(everyRoute())) {
      expect(res.status).toBe(401);
      expect(typeof (await res.json()).error).toBe("string");
    }
    expect(state.calls).toHaveLength(0);
  });

  it("answers 503 with a clear message when Supabase is not configured", async () => {
    state.configured = false;
    for (const res of await Promise.all(everyRoute())) {
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/not set up/i);
    }
    expect(state.calls).toHaveLength(0);
  });

  it("refuses cross-site writes", async () => {
    const res = await save(request("POST", "/api/sessions", body, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(state.calls).toHaveLength(0);
  });

  it("rate limits per user", async () => {
    state.user = { id: "22222222-2222-4222-8222-222222222222", email: null };
    const statuses: number[] = [];
    const once = () => {
      state.results.push({ data: [] });
      return list(request("GET", "/api/sessions")).then((res) => res.status);
    };
    for (let i = 0; i < 61; i++) statuses.push(await once());
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    expect(state.calls).toHaveLength(60); // the limited request never reached the database
    // Another user is unaffected.
    state.user = USER;
    state.results.length = 0;
    expect(await once()).toBe(200);
  });
});

describe("POST /api/sessions", () => {
  it("rejects invalid bodies with 400 and makes no database call", async () => {
    const bad = [
      "{not json",
      {},
      { ...body, id: "not-a-uuid" },
      { ...body, id: undefined },
      { ...body, companionId: "wizard" },
      { ...body, messages: [] },
      { ...body, messages: [{ role: "user", content: "x".repeat(5000), t: 0 }] },
      { ...body, messages: [{ role: "system", content: "hi", t: 0 }] },
      { ...body, durationMs: -5 },
      { ...body, notes: { ...notes, overall: "9/10" } },
      { ...body, notes: { ...notes, summary: "x".repeat(5000) } },
    ];
    for (const b of bad) {
      const res = await save(request("POST", "/api/sessions", b));
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe("string");
    }
    expect(state.calls).toHaveLength(0);
  });

  it("rejects an oversized body with 413 and makes no database call", async () => {
    const res = await save(request("POST", "/api/sessions", JSON.stringify({ ...body, pad: "x".repeat(1_000_001) })));
    expect(res.status).toBe(413);
    expect(state.calls).toHaveLength(0);
  });

  it("upserts on id with the verified user's id, never one chosen by the client", async () => {
    const res = await save(request("POST", "/api/sessions", { ...body, user_id: "attacker", userId: "attacker", created_at: "1999-01-01" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID });
    expect(res.headers.get("cache-control")).toMatch(/no-store/);

    // lookup, count, upsert: all on the sessions table and all scoped to the signed-in user.
    expect(state.calls.map((c) => c.table)).toEqual(["sessions", "sessions", "sessions"]);
    expect(ops(0)).toContainEqual(["eq", "user_id", USER.id]);
    expect(ops(1)).toContainEqual(["eq", "user_id", USER.id]);

    const [, payload, options] = op(2, "upsert")!;
    expect(options).toEqual({ onConflict: "id" });
    expect(payload).toEqual({
      id: ID,
      user_id: USER.id,
      companion_id: "interview",
      selections: body.selections,
      messages: body.messages,
      duration_ms: 30_000,
      user_turns: 2,
      notes,
    });
    expect(JSON.stringify(payload)).not.toContain("attacker");
  });

  it("updates an existing row without counting it against the cap", async () => {
    state.results.push({ data: { id: ID } });
    const res = await save(request("POST", "/api/sessions", body));
    expect(res.status).toBe(200);
    expect(state.calls).toHaveLength(2); // lookup, upsert
    expect(op(1, "upsert")).toBeDefined();
  });

  it("answers 409 at the per-user cap and does not insert", async () => {
    state.results.push({ data: null }, { count: MAX_SAVED_SESSIONS });
    const res = await save(request("POST", "/api/sessions", body));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/history is full/i);
    expect(state.calls).toHaveLength(2);
    expect(state.calls.some((c) => c.ops.some((o) => o[0] === "upsert"))).toBe(false);
  });

  it("fails soft with 503 on a database error and never logs or returns transcript content", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.results.push({ data: null }, { count: 0 }, { error: { code: "23514", message: `Failing row contains (${SECRET})` } });
    const res = await save(request("POST", "/api/sessions", body));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("Failing row");
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(log.mock.calls)).toContain("23514");
    log.mockRestore();
  });
});

describe("GET /api/sessions", () => {
  const row = (i: number) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    companion_id: "interview",
    duration_ms: 60_000 + i,
    user_turns: i,
    created_at: `2026-10-10T12:00:${String(59 - i).padStart(2, "0")}.123456+00:00`,
    overall: i === 0 ? "strong" : i === 1 ? "7/10" : null,
  });

  it("lists summaries newest first, without selecting transcripts", async () => {
    state.results.push({ data: [row(0), row(1), row(2)] });
    const res = await list(request("GET", "/api/sessions"));
    expect(res.status).toBe(200);
    const page = await res.json();
    expect(page.nextCursor).toBeNull();
    expect(page.sessions[0]).toEqual({
      id: row(0).id,
      companionId: "interview",
      companionName: "interview companion",
      createdAt: row(0).created_at,
      durationMs: 60_000,
      overall: "strong",
      userTurns: 0,
    });
    // A stored level that is not one of the three labels is never passed through.
    expect(page.sessions.map((s: { overall: unknown }) => s.overall)).toEqual(["strong", null, null]);

    const columns = String(op(0, "select")![1]);
    expect(columns).not.toMatch(/messages|selections/);
    expect(ops(0)).toContainEqual(["eq", "user_id", USER.id]);
    expect(ops(0)).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(ops(0)).toContainEqual(["limit", 21]);
    expect(op(0, "lt")).toBeUndefined();
  });

  it("pages with a cursor: 20 per page, next cursor is the last row shown", async () => {
    state.results.push({ data: Array.from({ length: 21 }, (_, i) => row(i)) });
    const first = await (await list(request("GET", "/api/sessions"))).json();
    expect(first.sessions).toHaveLength(20);
    expect(first.nextCursor).toBe(row(19).created_at);

    state.results.push({ data: [row(20)] });
    const res = await list(request("GET", `/api/sessions?cursor=${encodeURIComponent(first.nextCursor)}`));
    const second = await res.json();
    expect(second.sessions.map((s: { id: string }) => s.id)).toEqual([row(20).id]);
    expect(second.nextCursor).toBeNull();
    expect(ops(1)).toContainEqual(["lt", "created_at", row(19).created_at]);
  });

  it("rejects a cursor that is not a timestamp, with no database call", async () => {
    for (const cursor of ["yesterday", "2026-10-10", "1); drop table sessions;--", ""]) {
      const res = await list(request("GET", `/api/sessions?cursor=${encodeURIComponent(cursor)}`));
      expect(res.status).toBe(400);
    }
    expect(state.calls).toHaveLength(0);
  });

  it("fails soft with 503 when the database is unreachable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.results.push({ error: { code: "PGRST000" } });
    expect((await list(request("GET", "/api/sessions"))).status).toBe(503);
    log.mockRestore();
  });
});

describe("/api/sessions/[id]", () => {
  const stored = {
    id: ID,
    companion_id: "interview",
    selections: body.selections,
    messages: body.messages,
    duration_ms: 30_000,
    notes,
    created_at: "2026-10-10T12:00:00.123456+00:00",
  };

  it("returns the saved session to its owner", async () => {
    state.results.push({ data: stored });
    const res = await getOne(request("GET", `/api/sessions/${ID}`), ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: ID,
      companionId: "interview",
      selections: body.selections,
      messages: body.messages,
      durationMs: 30_000,
      notes,
      createdAt: stored.created_at,
    });
    expect(ops(0)).toContainEqual(["eq", "id", ID]);
    expect(ops(0)).toContainEqual(["eq", "user_id", USER.id]);
  });

  it("answers the same 404 for a missing row, another user's row and a malformed id", async () => {
    // Row-level security makes another user's row look exactly like a missing one: no data.
    const missing = await getOne(request("GET", `/api/sessions/${ID}`), ctx(ID));
    const malformed = await getOne(request("GET", "/api/sessions/1%20or%201=1"), ctx("1 or 1=1"));
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(await missing.json()).toEqual(await malformed.json());
    expect(state.calls).toHaveLength(1); // the malformed id never reached the database
  });

  it("deletes only the owner's row, and 404s when nothing was deleted", async () => {
    state.results.push({ data: [{ id: ID }] });
    expect((await deleteOne(request("DELETE", `/api/sessions/${ID}`), ctx(ID))).status).toBe(200);
    expect(op(0, "delete")).toBeDefined();
    expect(ops(0)).toContainEqual(["eq", "id", ID]);
    expect(ops(0)).toContainEqual(["eq", "user_id", USER.id]);

    state.results.push({ data: [] });
    expect((await deleteOne(request("DELETE", `/api/sessions/${ID}`), ctx(ID))).status).toBe(404);
    expect((await deleteOne(request("DELETE", "/api/sessions/nope"), ctx("nope"))).status).toBe(404);
    expect(state.calls).toHaveLength(2);
  });
});

describe("DELETE /api/account/data", () => {
  it("deletes every session of the signed-in user and nobody else's", async () => {
    state.results.push({ count: 7 });
    const res = await deleteAll(request("DELETE", "/api/account/data"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 7 });
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].table).toBe("sessions");
    expect(op(0, "delete")).toBeDefined();
    // The only filter is the verified user's id.
    expect(ops(0).filter((o) => o[0] === "eq")).toEqual([["eq", "user_id", USER.id]]);
  });
});
