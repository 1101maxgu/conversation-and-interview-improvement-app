// Server-only: reads API keys from env. Never import this from client code.
//
// One OpenAI-compatible chat-completions client over fetch, tried against an ordered list of
// providers. Facts checked against the providers' docs on 2026-10-10:
//
// Gemini  https://ai.google.dev/gemini-api/docs/openai  (+ /models, /pricing, /thinking)
//   VERIFIED: POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions,
//   "Authorization: Bearer <key>", stream:true, stream_options.include_usage, reasoning_effort.
//   gemini-3.5-flash-lite is the fastest/cheapest current model, is free of charge on the free
//   tier, and thinks at "minimal" by default (it cannot be turned off; thinking tokens count
//   against max_tokens). gemini-3.8-flash's lowest level is "low": set GEMINI_REASONING_EFFORT
//   when changing GEMINI_MODEL.
//   ASSUMED: response_format {type:"json_object"} (the docs only show structured output via the
//   SDK's parse helper), free-tier rate limits (docs point to AI Studio, no numbers).
// NVIDIA NIM  https://docs.api.nvidia.com/nim/reference/meta-llama-3_3-70b-instruct-infer
//   VERIFIED: POST https://integrate.api.nvidia.com/v1/chat/completions, Bearer auth, SSE
//   streaming, max_tokens, model id "meta/llama-3.3-70b-instruct".
//   NOT DOCUMENTED there: response_format and stream_options, so neither is sent.
// Bytez  https://docs.bytez.com/http-reference/oaiCompliant/chatCompletions.md
//        https://docs.bytez.com/http-reference/examples/openai-compliant/chatCompletionsExample.md
//   VERIFIED: POST https://api.bytez.com/models/v2/openai/v1/chat/completions, the token limit
//   is "max_completion_tokens" (max_tokens is not listed), stream is supported, open models are
//   named like "Qwen/Qwen3-4B", closed ones "<provider>/<model>" plus a provider-key header.
//   The docs' curl sends the raw key in Authorization; their OpenAI-SDK example (which sends
//   "Bearer <key>") also works, so Bearer is used. NOT DOCUMENTED: response_format, the
//   streaming wire format and usage, so Bytez is called non-streaming without JSON mode.
// Groq  https://console.groq.com/docs/api-reference  (+ /docs/openai, /docs/models, /docs/reasoning,
//       /docs/rate-limits)
//   VERIFIED: POST https://api.groq.com/openai/v1/chat/completions, Bearer auth, stream with a
//   final "data: [DONE]", stream_options, response_format json_object, max_completion_tokens
//   (max_tokens is deprecated). openai/gpt-oss-20b is the fastest production chat model
//   (~1000 tokens/s). It always reasons: reasoning_effort is low|medium|high, and the reasoning
//   arrives in a separate "reasoning" field, which is ignored here. The quicker-to-answer
//   alternative is GROQ_MODEL=qwen/qwen3.8-27b with GROQ_REASONING_EFFORT=none, but that model is
//   "preview" (may be discontinued at short notice).
//   ASSUMED: that reasoning tokens count against max_completion_tokens (as on the others), and
//   the free-plan limits: the docs table (30 requests/min, 1K requests/day, 8K tokens/min) is
//   labelled as the Developer plan's base limits and points to the account's limits page.
// Cerebras  https://inference-docs.cerebras.ai/api-reference/chat-completions  (+ /models/overview,
//           /capabilities/reasoning, /support/rate-limits)
//   VERIFIED: POST https://api.cerebras.ai/v1/chat/completions, Bearer auth, stream,
//   max_completion_tokens (max_tokens is an alias), response_format json_object (non-streaming
//   only, which is how generateJson calls it). qwen-3.8-27b (~1850 tokens/s) is on the free
//   tier and reasons at "high" by default; reasoning_effort "none" turns that off. Free tier:
//   5 requests/min, 30K uncached tokens/min, 1M tokens/day, so it will often answer 429 and
//   fall through. NOT DOCUMENTED: stream_options, so it is not sent.
// OpenRouter  https://openrouter.ai/docs/api-reference/chat-completion  (+ /authentication, /limits,
//             https://openrouter.ai/api/v1/models for the live model list)
//   VERIFIED: POST https://openrouter.ai/api/v1/chat/completions, Bearer auth (HTTP-Referer and
//   X-OpenRouter-Title are optional, not sent), SSE streaming ending in [DONE].
//   google/gemma-4-31b-it:free is currently listed, free, has reasoning off by default and
//   supports response_format; its supported parameters list max_tokens, not
//   max_completion_tokens (the API spec calls max_tokens deprecated, but the model page says
//   unsupported parameters can be rejected with 400). Free models: 20 requests/min and 50
//   requests/day (1,000/day once the account has bought 10 credits).
//   ASSUMED: that the free model stays listed; free model line-ups change often.
//
// Adding a provider is one entry in PROVIDERS. For every provider NAME the env vars
// NAME_API_KEY, NAME_MODEL, NAME_BASE_URL and NAME_REASONING_EFFORT are read at call time (never
// cached), so nothing here needs a code change when a model is retired.

import type { z } from "zod";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export class LlmError extends Error {
  /** 429 when every provider was rate limited, 503 when none is configured, else 502. */
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

/** A provider that has not produced a first token by now is treated as down, so the user is not left waiting. */
export const FIRST_TOKEN_TIMEOUT_MS = 8_000;
/** Whole-response budget for non-streaming calls (JSON generation, providers that cannot stream). */
export const RESPONSE_TIMEOUT_MS = 30_000;

type Provider = {
  name: string;
  url: string;
  key: string;
  model: string;
  stream: boolean;
  /** Send response_format json_object in generateJson. */
  jsonMode: boolean;
  maxTokensParam: "max_tokens" | "max_completion_tokens";
  /** Provider-specific body fields (reasoning_effort). */
  extra?: Record<string, unknown>;
  /** Extra fields for streaming requests only. */
  streamExtra?: Record<string, unknown>;
};

type CallOpts = { messages: LlmMessage[]; maxTokens?: number; temperature?: number; signal?: AbortSignal };

/** Options for generateJson: `attempts` is how many tries each provider gets (default 2: one corrective retry). */
type JsonOpts = CallOpts & { attempts?: number };

type ProviderDefaults = Omit<Provider, "name" | "key" | "extra"> & {
  /** Default reasoning_effort; NAME_REASONING_EFFORT overrides it, and an empty value sends none. */
  effort?: string;
};

const USAGE = { stream_options: { include_usage: true } };

// Insertion order is the default order: fastest first, because this drives a voice conversation.
const PROVIDERS: Record<string, ProviderDefaults> = {
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.5-flash-lite",
    stream: true,
    jsonMode: true,
    maxTokensParam: "max_tokens",
    effort: "minimal",
    streamExtra: USAGE,
  },
  groq: {
    url: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-20b",
    stream: true,
    jsonMode: true,
    maxTokensParam: "max_completion_tokens",
    effort: "low",
    streamExtra: USAGE,
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1",
    model: "qwen-3.8-27b",
    stream: true,
    jsonMode: true,
    maxTokensParam: "max_completion_tokens",
    effort: "none",
  },
  nvidia: {
    url: "https://integrate.api.nvidia.com/v1",
    model: "meta/llama-3.3-70b-instruct",
    stream: true,
    jsonMode: false,
    maxTokensParam: "max_tokens",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1",
    model: "google/gemma-4-31b-it:free",
    stream: true,
    jsonMode: true,
    maxTokensParam: "max_tokens",
  },
  bytez: {
    url: "https://api.bytez.com/models/v2/openai/v1",
    model: "Qwen/Qwen3-4B",
    stream: false,
    jsonMode: false,
    maxTokensParam: "max_completion_tokens",
  },
};

const keyVars = () => Object.keys(PROVIDERS).map((name) => `${name.toUpperCase()}_API_KEY`);

/** Providers that have a key, in the order they will be tried. Env is read on every call. */
function getProviders(): Provider[] {
  const env = process.env;
  const order = (env.LLM_PROVIDER_ORDER || Object.keys(PROVIDERS).join(",")).split(",").map((s) => s.trim().toLowerCase());
  const providers: Provider[] = [];
  for (const name of new Set(order)) {
    const prefix = name.toUpperCase();
    const key = env[`${prefix}_API_KEY`];
    if (!Object.hasOwn(PROVIDERS, name) || !key) continue;
    const { effort: defaultEffort, ...defaults } = PROVIDERS[name];
    const effort = env[`${prefix}_REASONING_EFFORT`] ?? defaultEffort;
    providers.push({
      ...defaults,
      name,
      key,
      url: env[`${prefix}_BASE_URL`] || defaults.url,
      model: env[`${prefix}_MODEL`] || defaults.model,
      extra: effort ? { reasoning_effort: effort } : undefined,
    });
  }
  return providers;
}

/** Names of the providers that have a key, in order (used by scripts/eval.ts). */
export const configuredProviders = (): string[] => getProviders().map((p) => p.name);

function requireProviders(): Provider[] {
  const providers = getProviders();
  if (!providers.length) throw new LlmError(503, `No LLM provider is configured. Set one of ${keyVars().join(", ")}.`);
  return providers;
}

function log(provider: Provider, info: Record<string, unknown>) {
  const env = process.env.NODE_ENV;
  if (env === "production" || env === "test") return;
  console.info("[llm]", { provider: provider.name, model: provider.model, ...info });
}

async function post(p: Provider, opts: CallOpts, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  const res = await fetch(`${p.url.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
    body: JSON.stringify({
      model: p.model,
      messages: opts.messages,
      temperature: opts.temperature,
      [p.maxTokensParam]: opts.maxTokens,
      ...p.extra,
      ...body,
    }),
    signal,
  });
  if (!res.ok) {
    // The body may echo request details; it is dropped, never logged or returned.
    await res.body?.cancel().catch(() => {});
    throw new LlmError(res.status, `${p.name} responded ${res.status}`);
  }
  return res;
}

/** Small open models (e.g. Qwen3 on Bytez) may emit their reasoning in <think> tags. */
const stripThink = (text: string) => text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();

/** Text deltas from one provider. Ends without yielding if the provider sends no text. */
async function* deltas(p: Provider, opts: CallOpts, signal: AbortSignal, onUsage: (u: unknown) => void): AsyncGenerator<string> {
  if (!p.stream) {
    const data = await (await post(p, opts, {}, signal)).json();
    onUsage(data?.usage);
    const text = stripThink(String(data?.choices?.[0]?.message?.content ?? ""));
    if (text) yield text;
    return;
  }

  const res = await post(p, opts, { stream: true, ...p.streamExtra }, signal);
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      // A `data:` line (or a multi-byte character) can be split across network chunks: only
      // complete lines are parsed, the tail waits for the next chunk.
      buffer += done ? decoder.decode() + "\n" : decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue; // blank separators, ": keep-alive" comments, "event:" lines
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        let chunk;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk?.usage) onUsage(chunk.usage);
        const text = chunk?.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) yield text;
      }
      if (done) return;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** Resolves once the provider has produced its first token; rejects if it fails before that. */
async function openStream(p: Provider, opts: CallOpts): Promise<ReadableStream<Uint8Array>> {
  const started = Date.now();
  const abort = new AbortController();
  const signal = opts.signal ? AbortSignal.any([opts.signal, abort.signal]) : abort.signal;
  let usage: unknown;
  const gen = deltas(p, opts, signal, (u) => (usage = u ?? usage));

  const timer = setTimeout(() => abort.abort(), p.stream ? FIRST_TOKEN_TIMEOUT_MS : RESPONSE_TIMEOUT_MS);
  let first: IteratorResult<string>;
  try {
    first = await gen.next();
  } finally {
    clearTimeout(timer);
  }
  if (first.done) throw new LlmError(502, `${p.name} returned no text`);
  const firstTokenMs = Date.now() - started;

  const encoder = new TextEncoder();
  let pending: string | undefined = first.value;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (pending !== undefined) {
          controller.enqueue(encoder.encode(pending));
          pending = undefined;
          return;
        }
        const next = await gen.next();
        if (!next.done) return controller.enqueue(encoder.encode(next.value));
      } catch {
        // Tokens have already been sent: never switch provider mid-reply, just end the stream.
      }
      log(p, { firstTokenMs, totalMs: Date.now() - started, usage });
      controller.close();
    },
    cancel() {
      abort.abort(); // the client went away: stop the upstream request
    },
  });
}

function allFailed(statuses: number[]): LlmError {
  return statuses.every((s) => s === 429)
    ? new LlmError(429, "All LLM providers are rate limited.")
    : new LlmError(502, "All LLM providers failed.");
}

const statusOf = (err: unknown) => (err instanceof LlmError ? err.status : 0);

/** Streams the reply as UTF-8 text deltas (no SSE framing), from the first provider that answers. */
export async function streamChat(opts: CallOpts): Promise<ReadableStream<Uint8Array>> {
  const call = { maxTokens: 160, temperature: 0.8, ...opts };
  const statuses: number[] = [];
  for (const p of requireProviders()) {
    try {
      return await openStream(p, call);
    } catch (err) {
      if (opts.signal?.aborted) throw err; // the caller gave up: do not try the next provider
      // Any failure before the first token moves on: 429, 5xx, network error, timeout, and
      // also 4xx such as a revoked key or a retired model id.
      statuses.push(statusOf(err));
      log(p, { failed: statusOf(err) || (err instanceof Error ? err.name : "error") });
    }
  }
  throw allFailed(statuses);
}

/** Finds the JSON value in a model reply, tolerating think tags, ```json fences and prose around it. */
function extractJson(raw: string): unknown {
  const text = stripThink(raw);
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[{[]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (start < 0 || end <= start) throw new Error("No JSON object found in the reply.");
  return JSON.parse(body.slice(start, end + 1));
}

const JSON_ONLY = "Respond with a single valid JSON object only: no prose, no code fences.";

/** Asks for JSON and validates it with `schema`. One corrective retry per provider, then the next provider. */
export async function generateJson<T>(opts: JsonOpts & { schema: z.ZodType<T> }): Promise<T> {
  // The instruction is merged into the first system message: some chat templates allow only one.
  const [head, ...rest] = opts.messages;
  const base: LlmMessage[] =
    head?.role === "system"
      ? [{ role: "system", content: `${head.content}\n\n${JSON_ONLY}` }, ...rest]
      : [{ role: "system", content: JSON_ONLY }, ...opts.messages];

  const statuses: number[] = [];
  for (const p of requireProviders()) {
    const messages = [...base];
    try {
      for (let attempt = 1; attempt <= (opts.attempts ?? 2); attempt++) {
        const started = Date.now();
        const timeout = AbortSignal.timeout(RESPONSE_TIMEOUT_MS);
        const res = await post(
          p,
          { messages, maxTokens: opts.maxTokens ?? 1500, temperature: opts.temperature ?? 0.3 },
          p.jsonMode ? { response_format: { type: "json_object" } } : {},
          opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
        );
        const data = await res.json();
        const raw = String(data?.choices?.[0]?.message?.content ?? "");
        log(p, { json: true, attempt, totalMs: Date.now() - started, usage: data?.usage });

        let problem: string;
        try {
          const parsed = opts.schema.safeParse(extractJson(raw));
          if (parsed.success) return parsed.data;
          problem = parsed.error.message;
        } catch (err) {
          problem = err instanceof Error ? err.message : "Invalid JSON.";
        }
        messages.push(
          { role: "assistant", content: raw.slice(0, 4000) },
          { role: "user", content: `That reply was not valid: ${problem.slice(0, 600)}\nSend the corrected JSON object only.` },
        );
      }
      statuses.push(0); // answered, never with valid output
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      statuses.push(statusOf(err));
      log(p, { json: true, failed: statusOf(err) || (err instanceof Error ? err.name : "error") });
    }
  }
  throw allFailed(statuses);
}
