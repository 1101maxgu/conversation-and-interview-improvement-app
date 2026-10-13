// Trust-boundary helpers shared by the API routes: limits, request schemas, rate limiting, safe redirects, error shape.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import type { ChatRequest, CompanionId, Message, NotesRequest, NotesResult, Selections } from "@/lib/types";

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Read once at module load. Override with the LIMIT_* env vars (see .env.example). */
export const LIMITS = {
  chatPerMin: envInt("LIMIT_CHAT_PER_MIN", 40),
  planPerMin: envInt("LIMIT_PLAN_PER_MIN", 10),
  /** Each plan is a full model call, so there is a slower cap on top of the per-minute one. */
  planPerHour: envInt("LIMIT_PLAN_PER_HOUR", 30),
  notesPerHour: envInt("LIMIT_NOTES_PER_HOUR", 6),
  /** Saved-history requests (save, list, open, delete) per signed-in user. */
  sessionsPerMin: envInt("LIMIT_SESSIONS_PER_MIN", 60),
  /** User turns per session. */
  maxTurns: envInt("LIMIT_MAX_TURNS", 40),
  maxMessageChars: envInt("LIMIT_MAX_MESSAGE_CHARS", 2000),
  maxFreeTextChars: envInt("LIMIT_MAX_FREE_TEXT_CHARS", 2000),
};

export const MAX_SELECTION_KEYS = 12;
const MAX_MESSAGES = 200;
const MAX_PLAN_CHARS = 12_000;
const MAX_DURATION_MS = 6 * 60 * 60 * 1000;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .max(LIMITS.maxMessageChars)
    .refine((s) => s.trim().length > 0, "Message is empty."),
  t: z.number().finite().min(0),
});

const chatShape = {
  // Shape is checked per companion by lib/agents validPlan; here only the size is capped.
  plan: z
    .unknown()
    .optional()
    .refine((p) => p === undefined || JSON.stringify(p).length <= MAX_PLAN_CHARS, "Plan is too large."),
  companionId: z.enum(["conversation", "interview", "sales", "case", "friend", "presentation"]),
  selections: z
    .record(z.string().max(64), z.string().max(LIMITS.maxFreeTextChars))
    .refine((r) => Object.keys(r).length <= MAX_SELECTION_KEYS, "Too many selections."),
  messages: z.array(messageSchema).max(MAX_MESSAGES),
};

export const chatRequestSchema: z.ZodType<ChatRequest> = z.object({ ...chatShape, resume: z.boolean().optional() });

export const notesRequestSchema: z.ZodType<NotesRequest> = z.object({
  ...chatShape,
  durationMs: z.number().finite().min(0).max(MAX_DURATION_MS),
});

// ---- Saved sessions (signed-in users only) --------------------------------

/** Request body cap shared by /api/notes and /api/sessions. The migration's size check matches it. */
export const MAX_BODY_BYTES = 1_000_000;
/** Stored sessions per user: keeps one account from filling the free database tier. */
export const MAX_SAVED_SESSIONS = 200;

const level = z.enum(["needs-work", "solid", "strong"]);
const count = z.number().finite().min(0).max(1_000_000);

/** Mirrors NotesResult, with size caps. Unknown keys are dropped. */
export const notesResultSchema: z.ZodType<NotesResult> = z.object({
  summary: z.string().max(2000),
  overall: level,
  dimensions: z.array(z.object({ label: z.string().max(100), level, reason: z.string().max(1000) })).max(12),
  notes: z
    .array(
      z.object({
        id: z.string().max(20),
        title: z.string().max(200),
        body: z.string().max(2000),
        tags: z.array(z.enum(["strength", "improve", "tip"])).max(3),
      }),
    )
    .max(20),
  stats: z.object({
    userWords: count,
    wpm: count,
    fillerCount: count,
    fillers: z.record(z.string().max(40), count).refine((r) => Object.keys(r).length <= 50, "Too many fillers."),
    talkRatio: z.number().min(0).max(1),
  }),
});

export type SaveSessionRequest = {
  id: string;
  companionId: CompanionId;
  selections: Selections;
  messages: Message[];
  durationMs: number;
  notes?: NotesResult | null;
};

/** POST /api/sessions. There is deliberately no user id here: the owner always comes from the verified session. */
export const saveSessionSchema: z.ZodType<SaveSessionRequest> = z.object({
  ...chatShape,
  id: z.uuid(),
  messages: chatShape.messages.min(1),
  durationMs: z.number().finite().min(0).max(MAX_DURATION_MS),
  notes: notesResultSchema.nullish(),
});

export const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

/**
 * Open-redirect guard for `?next=`: only a plain same-origin path survives, anything else becomes the fallback.
 * Rejects absolute URLs, protocol-relative `//host`, and the backslash and control-character forms that browsers
 * normalise into them.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/history"): string {
  if (!next || next.length > 512) return fallback;
  // One leading slash, not followed by another slash or a backslash; no backslashes or control characters anywhere.
  if (!/^\/(?![/\\])[^\\\u0000-\u001f\u007f]*$/.test(next)) return fallback;
  try {
    // Belt and braces: resolved against a dummy origin it must stay on that origin.
    return new URL(next, "http://n").origin === "http://n" ? next : fallback;
  } catch {
    return fallback;
  }
}

/** False only when a browser says the request came from another site (CSRF backstop for cookie-authenticated writes). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients and same-origin GETs send none
  try {
    const { host } = new URL(origin);
    return host === req.headers.get("host") || host === req.headers.get("x-forwarded-host") || host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Reads a JSON request body with a size cap. Gives back the parsed value, or the error response to send. */
export async function readJson(req: Request): Promise<{ body: unknown } | { error: Response }> {
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) return { error: jsonError(413, "Request is too large.") };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return { error: jsonError(413, "Request is too large.") };
    return { body: JSON.parse(text) };
  } catch {
    return { error: jsonError(400, "Request body must be JSON.") };
  }
}

// ---- Rate limiting ---------------------------------------------------------
// With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set, limits live in Upstash Redis (sliding window), so they
// survive cold starts and are shared by every server instance. Without them (local dev), or whenever Upstash errors or
// times out, the in-memory limiter below is used instead: a limiter outage must never lock users out (fail open).

const MAX_ENTRIES = 10_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Fixed window, per process. Returns the reset time (ms) when over the limit, else null. */
function memoryLimit(key: string, limit: number, windowMs: number): number | null {
  const now = Date.now();
  let entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    // Keep the Map bounded: sweep expired windows, then evict the oldest if still full.
    if (hits.size >= MAX_ENTRIES) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      if (hits.size >= MAX_ENTRIES) hits.delete(hits.keys().next().value!);
    }
    entry = { count: 0, resetAt: now + windowMs };
    hits.delete(key);
    hits.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= limit ? null : entry.resetAt;
}

/** How long one Upstash check may take before we stop waiting and use the in-memory limiter. */
const UPSTASH_TIMEOUT_MS = 1500;
let redis: Redis | undefined;
const limiters = new Map<string, Ratelimit>();
let warned = false;

function upstashLimiter(bucket: string, limit: number, windowMs: number): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const id = `${bucket}:${limit}:${windowMs}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    // No client-side retries: the timeout below decides, and retrying would only add latency to every request.
    redis ??= new Redis({ url, token, retry: { retries: 0 } });
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: `rl:${bucket}`,
      timeout: UPSTASH_TIMEOUT_MS,
      analytics: false,
    });
    limiters.set(id, limiter);
  }
  return limiter;
}

/**
 * Per bucket + identity. `identity` is the signed-in user's id; without one the client IP is used.
 * Returns null when allowed, otherwise a 429 Response with `Retry-After` and an `{ error }` body.
 */
export async function rateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number,
  identity?: string | null,
): Promise<Response | null> {
  const who = identity ? `u:${identity}` : `ip:${clientIp(req)}`;

  let resetAt: number | null | undefined;
  try {
    const limiter = upstashLimiter(bucket, limit, windowMs);
    if (limiter) {
      const result = await limiter.limit(who);
      // On a timeout the library answers "allowed" with reason "timeout": treat that as "Upstash is down".
      if (result.reason !== "timeout") resetAt = result.success ? null : result.reset;
    }
  } catch {
    // Fall through to the in-memory limiter.
  }
  if (resetAt === undefined) {
    if (!warned && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      warned = true;
      console.warn("[guard] Upstash rate limiting is unavailable; using the in-memory limiter instead.");
    } else if (!warned && process.env.NODE_ENV === "production") {
      // Without Upstash each server instance counts by itself and forgets on a cold start: limits are looser than set.
      warned = true;
      console.warn("[guard] Upstash is not configured; rate limits are in memory only. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    }
    resetAt = memoryLimit(`${bucket}:${who}`, limit, windowMs);
  }
  if (resetAt === null) return null;

  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  const wait = retryAfter >= 90 ? `${Math.ceil(retryAfter / 60)} minutes` : `${retryAfter} seconds`;
  return Response.json(
    { error: `Too many requests. Please try again in ${wait}.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
