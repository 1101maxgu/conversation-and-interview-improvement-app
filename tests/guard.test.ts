import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Upstash is mocked: `limit` stands in for the Redis round trip, `created` records how each limiter was configured.
const upstash = vi.hoisted(() => ({ limit: vi.fn(), created: [] as Record<string, unknown>[] }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  },
}));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = (tokens: number, window: string) => ({ tokens, window });
    constructor(config: Record<string, unknown>) {
      upstash.created.push(config);
    }
    limit = (id: string) => upstash.limit(id);
  },
}));

import {
  LIMITS,
  chatRequestSchema,
  jsonError,
  notesRequestSchema,
  notesResultSchema,
  rateLimit,
  safeNextPath,
  sameOrigin,
  saveSessionSchema,
} from "@/lib/guard";

const req = (ip?: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { headers: ip ? { "x-forwarded-for": ip, ...headers } : headers });

describe("rateLimit (in memory, no Upstash env)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows requests under the limit and returns 429 over it", async () => {
    for (let i = 0; i < 3; i++) expect(await rateLimit(req("1.1.1.1"), "t1", 3, 60_000)).toBeNull();
    const res = await rateLimit(req("1.1.1.1"), "t1", 3, 60_000);
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(res?.headers.get("Retry-After"))).toBeLessThanOrEqual(60);
    expect(typeof (await res!.json()).error).toBe("string");
    expect(upstash.limit).not.toHaveBeenCalled();
  });

  it("allows again after the window expires", async () => {
    expect(await rateLimit(req("2.2.2.2"), "t2", 1, 60_000)).toBeNull();
    expect((await rateLimit(req("2.2.2.2"), "t2", 1, 60_000))?.status).toBe(429);
    vi.advanceTimersByTime(59_000);
    expect((await rateLimit(req("2.2.2.2"), "t2", 1, 60_000))?.status).toBe(429);
    vi.advanceTimersByTime(1_001);
    expect(await rateLimit(req("2.2.2.2"), "t2", 1, 60_000)).toBeNull();
  });

  it("keeps buckets and IPs independent", async () => {
    expect(await rateLimit(req("3.3.3.3"), "t3a", 1, 60_000)).toBeNull();
    expect(await rateLimit(req("3.3.3.3"), "t3b", 1, 60_000)).toBeNull();
    expect(await rateLimit(req("4.4.4.4"), "t3a", 1, 60_000)).toBeNull();
    expect((await rateLimit(req("3.3.3.3"), "t3a", 1, 60_000))?.status).toBe(429);
  });

  it("uses the first x-forwarded-for hop, then x-real-ip, then a shared 'unknown' key", async () => {
    expect(await rateLimit(req("5.5.5.5, 10.0.0.1"), "t4", 1, 60_000)).toBeNull();
    expect((await rateLimit(req("5.5.5.5, 10.0.0.2"), "t4", 1, 60_000))?.status).toBe(429);
    expect(await rateLimit(req(undefined, { "x-real-ip": "6.6.6.6" }), "t4", 1, 60_000)).toBeNull();
    expect((await rateLimit(req(undefined, { "x-real-ip": "6.6.6.6" }), "t4", 1, 60_000))?.status).toBe(429);
    expect(await rateLimit(req(), "t4", 1, 60_000)).toBeNull();
    expect((await rateLimit(req(), "t4", 1, 60_000))?.status).toBe(429);
  });

  it("keys by the identity instead of the IP when one is given", async () => {
    expect(await rateLimit(req("7.7.7.7"), "t5", 1, 60_000, "user-a")).toBeNull();
    // The same user from another IP shares the allowance; another user, or a guest on the first IP, does not.
    expect((await rateLimit(req("8.8.8.8"), "t5", 1, 60_000, "user-a"))?.status).toBe(429);
    expect(await rateLimit(req("7.7.7.7"), "t5", 1, 60_000, "user-b")).toBeNull();
    expect(await rateLimit(req("7.7.7.7"), "t5", 1, 60_000)).toBeNull();
    // null and undefined both mean "guest": this is the second request from that IP.
    expect((await rateLimit(req("7.7.7.7"), "t5", 1, 60_000, null))?.status).toBe(429);
  });

  it("stays bounded and keeps working when flooded with distinct IPs", async () => {
    for (let i = 0; i < 12_000; i++) await rateLimit(req(`ip-${i}`), "flood", 1, 60_000);
    expect(await rateLimit(req("fresh"), "flood", 1, 60_000)).toBeNull();
    expect((await rateLimit(req("fresh"), "flood", 1, 60_000))?.status).toBe(429);
  });
});

describe("rateLimit (Upstash configured)", () => {
  const ok = { success: true, limit: 5, remaining: 4, reset: 0, pending: Promise.resolve() };

  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    upstash.limit.mockReset();
    upstash.created.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses a sliding window with a per-bucket prefix, keyed by user id or IP", async () => {
    upstash.limit.mockResolvedValue(ok);
    expect(await rateLimit(req("9.9.9.9"), "u1", 5, 60_000)).toBeNull();
    expect(await rateLimit(req("9.9.9.9"), "u1", 5, 60_000, "user-1")).toBeNull();
    expect(upstash.limit.mock.calls.map((c) => c[0])).toEqual(["ip:9.9.9.9", "u:user-1"]);
    // One limiter per bucket, reused across calls.
    expect(upstash.created).toHaveLength(1);
    expect(upstash.created[0]).toMatchObject({ prefix: "rl:u1", limiter: { tokens: 5, window: "60000 ms" } });
    expect(Number(upstash.created[0].timeout)).toBeGreaterThan(0);
  });

  it("returns 429 with Retry-After from the Upstash reset time", async () => {
    upstash.limit.mockResolvedValue({ ...ok, success: false, remaining: 0, reset: Date.now() + 30_000 });
    const res = await rateLimit(req("9.9.9.9"), "u2", 5, 60_000);
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("Retry-After"))).toBeGreaterThanOrEqual(29);
    expect(Number(res?.headers.get("Retry-After"))).toBeLessThanOrEqual(30);
    expect((await res!.json()).error).toMatch(/too many requests/i);
  });

  it("fails open to the in-memory limiter when Upstash throws or times out, and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    upstash.limit.mockRejectedValue(new Error("ECONNRESET"));
    expect(await rateLimit(req("9.9.9.9"), "u3", 2, 60_000)).toBeNull();
    // The library reports its own timeout as an allowed request with reason "timeout".
    upstash.limit.mockResolvedValue({ ...ok, reason: "timeout" });
    expect(await rateLimit(req("9.9.9.9"), "u3", 2, 60_000)).toBeNull();
    // Still limited while Upstash is down: the third request is over the in-memory limit of 2.
    expect((await rateLimit(req("9.9.9.9"), "u3", 2, 60_000))?.status).toBe(429);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toMatch(/token|ECONNRESET/);
    warn.mockRestore();
  });
});

describe("jsonError", () => {
  it("returns { error } with the status", async () => {
    const res = jsonError(400, "Bad request.");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad request." });
  });
});

describe("request schemas", () => {
  const valid = {
    companionId: "interview",
    selections: { type: "behavioral", role: "Junior analyst" },
    messages: [
      { role: "assistant", content: "Tell me about yourself.", t: 1200 },
      { role: "user", content: "I'm a recent graduate.", t: 6400 },
    ],
  };
  const bad = (patch: Record<string, unknown>) => chatRequestSchema.safeParse({ ...valid, ...patch }).success;

  it("has the documented default limits", () => {
    expect(LIMITS).toEqual({
      chatPerMin: 40,
      planPerMin: 10,
      planPerHour: 30,
      notesPerHour: 6,
      sessionsPerMin: 60,
      maxTurns: 40,
      maxMessageChars: 2000,
      maxFreeTextChars: 2000,
    });
  });

  it("accepts a valid chat body, including empty messages", () => {
    expect(chatRequestSchema.safeParse(valid).success).toBe(true);
    expect(chatRequestSchema.safeParse({ ...valid, messages: [] }).success).toBe(true);
  });

  it("rejects malformed bodies", () => {
    for (const body of [null, undefined, "text", 42, [], {}]) {
      expect(chatRequestSchema.safeParse(body).success).toBe(false);
    }
    expect(bad({ companionId: "wizard" })).toBe(false);
    expect(bad({ selections: { type: 3 } })).toBe(false);
    expect(bad({ selections: null })).toBe(false);
    expect(bad({ messages: "hello" })).toBe(false);
    expect(bad({ messages: [{ role: "system", content: "x", t: 0 }] })).toBe(false);
    expect(bad({ messages: [{ role: "user", content: "", t: 0 }] })).toBe(false);
    expect(bad({ messages: [{ role: "user", content: "   ", t: 0 }] })).toBe(false);
    expect(bad({ messages: [{ role: "user", content: "x", t: -1 }] })).toBe(false);
    expect(bad({ messages: [{ role: "user", content: "x", t: Number.POSITIVE_INFINITY }] })).toBe(false);
    expect(bad({ messages: [{ role: "user", content: "x" }] })).toBe(false);
  });

  it("rejects oversized bodies", () => {
    const msg = { role: "user", content: "x", t: 0 };
    expect(bad({ messages: [{ ...msg, content: "x".repeat(LIMITS.maxMessageChars + 1) }] })).toBe(false);
    expect(bad({ messages: Array.from({ length: 201 }, () => msg) })).toBe(false);
    expect(bad({ selections: { role: "x".repeat(LIMITS.maxFreeTextChars + 1) } })).toBe(false);
    expect(bad({ selections: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${i}`, "v"])) })).toBe(false);
  });

  it("notes body additionally needs a sane durationMs", () => {
    const ok = (durationMs: unknown) => notesRequestSchema.safeParse({ ...valid, durationMs }).success;
    expect(ok(90_000)).toBe(true);
    expect(ok(0)).toBe(true);
    expect(notesRequestSchema.safeParse(valid).success).toBe(false);
    expect(ok(-1)).toBe(false);
    expect(ok("90000")).toBe(false);
    expect(ok(Number.NaN)).toBe(false);
    expect(ok(6 * 60 * 60 * 1000 + 1)).toBe(false);
  });

  const notes = {
    summary: "Clear answers.",
    overall: "solid",
    dimensions: [{ label: "Structure", level: "strong", reason: "You led with the result." }],
    notes: [{ id: "n1", title: "Clear result", body: "Keep leading with outcomes.", tags: ["strength"] }],
    stats: { userWords: 34, wpm: 120, fillerCount: 4, fillers: { um: 1 }, talkRatio: 0.7 },
  };
  const save = { ...valid, id: "3f2b8c1e-5d47-4a9b-8c6f-0e1d2a3b4c5d", durationMs: 30_000, notes };

  it("notes result schema mirrors NotesResult and rejects numeric scores, unknown levels and oversized text", () => {
    expect(notesResultSchema.safeParse(notes).success).toBe(true);
    expect(notesResultSchema.safeParse({ ...notes, overall: "7/10" }).success).toBe(false);
    expect(notesResultSchema.safeParse({ ...notes, stats: { ...notes.stats, talkRatio: 1.5 } }).success).toBe(false);
    expect(notesResultSchema.safeParse({ ...notes, notes: [{ ...notes.notes[0], tags: ["bogus"] }] }).success).toBe(false);
    expect(notesResultSchema.safeParse({ ...notes, summary: "x".repeat(2001) }).success).toBe(false);
    expect(notesResultSchema.safeParse({ ...notes, notes: Array.from({ length: 21 }, () => notes.notes[0]) }).success).toBe(false);
  });

  it("save body needs a uuid and a transcript, keeps the size limits, and drops unknown keys such as a user id", () => {
    const ok = (patch: Record<string, unknown>) => saveSessionSchema.safeParse({ ...save, ...patch }).success;
    expect(ok({})).toBe(true);
    expect(ok({ notes: null })).toBe(true);
    expect(ok({ notes: undefined })).toBe(true);
    expect(ok({ id: "not-a-uuid" })).toBe(false);
    expect(ok({ id: undefined })).toBe(false);
    expect(ok({ messages: [] })).toBe(false);
    expect(ok({ messages: [{ role: "user", content: "x".repeat(LIMITS.maxMessageChars + 1), t: 0 }] })).toBe(false);
    expect(ok({ durationMs: -1 })).toBe(false);
    expect(ok({ notes: { ...notes, overall: "great" } })).toBe(false);
    const parsed = saveSessionSchema.parse({ ...save, user_id: "someone-else", userId: "someone-else" });
    expect(Object.keys(parsed).sort()).toEqual(["companionId", "durationMs", "id", "messages", "notes", "selections"]);
  });
});

describe("safeNextPath (open-redirect guard for the auth callback)", () => {
  it("keeps plain same-origin paths", () => {
    for (const path of ["/history", "/", "/results?id=3f2b8c1e-5d47-4a9b-8c6f-0e1d2a3b4c5d", "/setup/interview#top"]) {
      expect(safeNextPath(path)).toBe(path);
    }
  });

  it("replaces anything that could leave the site with the fallback", () => {
    const evil = [
      "//evil.com",
      "https://evil.com",
      "http://evil.com/history",
      "/\\evil.com",
      "/\\/evil.com",
      "\\\\evil.com",
      "/history\\..\\//evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "javascript:alert(1)",
      "evil.com",
      "history",
      " /history",
      "",
      "/" + "a".repeat(600),
    ];
    for (const next of evil) expect(safeNextPath(next), JSON.stringify(next)).toBe("/history");
    expect(safeNextPath(null)).toBe("/history");
    expect(safeNextPath(undefined)).toBe("/history");
    expect(safeNextPath("//evil.com", "/")).toBe("/");
  });
});

describe("sameOrigin", () => {
  const from = (headers: Record<string, string>) =>
    sameOrigin(new Request("https://app.example/api/sessions", { method: "POST", headers }));

  it("allows requests without an Origin header and same-site origins, rejects other sites", () => {
    expect(from({})).toBe(true);
    expect(from({ origin: "https://app.example" })).toBe(true);
    expect(from({ origin: "https://public.example", "x-forwarded-host": "public.example" })).toBe(true);
    expect(from({ origin: "https://evil.example" })).toBe(false);
    expect(from({ origin: "null" })).toBe(false);
  });
});
