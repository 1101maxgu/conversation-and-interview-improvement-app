import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { configuredProviders, FIRST_TOKEN_TIMEOUT_MS, generateJson, LlmError, streamChat } from "../lib/llm";

const NAMES = ["GEMINI", "GROQ", "CEREBRAS", "NVIDIA", "OPENROUTER", "BYTEZ"];
const ENV_KEYS = ["LLM_PROVIDER_ORDER", ...NAMES.flatMap((n) => [`${n}_API_KEY`, `${n}_MODEL`, `${n}_BASE_URL`, `${n}_REASONING_EFFORT`])];
const saved: Record<string, string | undefined> = {};
const fetchMock = vi.fn();
const messages = [{ role: "user" as const, content: "hi" }];
const enc = new TextEncoder();

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const delta = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

/** An SSE response whose body arrives in exactly the given byte chunks. */
function sse(chunks: (string | Uint8Array)[], failAfter = false): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        const c = chunks[i++];
        controller.enqueue(typeof c === "string" ? enc.encode(c) : c);
      } else if (failAfter) controller.error(new Error("connection reset"));
      else controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
const completion = (content: string) =>
  Response.json({ choices: [{ message: { role: "assistant", content } }], usage: { total_tokens: 5 } });
const status = (code: number) => new Response('{"error":"secret upstream detail"}', { status: code });

const urlOf = (call: number) => String(fetchMock.mock.calls[call][0]);
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);
const read = async (stream: ReadableStream<Uint8Array>) => new Response(stream).text();

describe("streamChat", () => {
  it("parses SSE split across awkward chunk boundaries", async () => {
    process.env.GEMINI_API_KEY = "g-key";
    const full =
      ": keep-alive\r\n\r\n" +
      `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content: "" } }] })}\r\n\r\n` +
      delta("MOOD:happy\n") +
      delta("Héllo ") +
      "data: not json\n\n" +
      `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n` +
      delta("wörld") +
      `data: ${JSON.stringify({ choices: [], usage: { total_tokens: 9 } })}\n\n` +
      "data: [DONE]\n\n" +
      delta("ignored after done");
    // 7-byte chunks cut through `data:` prefixes, JSON payloads and multi-byte characters.
    const bytes = enc.encode(full);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += 7) chunks.push(bytes.slice(i, i + 7));
    fetchMock.mockResolvedValueOnce(sse(chunks));

    expect(await read(await streamChat({ messages }))).toBe("MOOD:happy\nHéllo wörld");
    expect(urlOf(0)).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer g-key");
    expect(bodyOf(0)).toMatchObject({ model: "gemini-3.5-flash-lite", stream: true, max_tokens: 160 });
  });

  it("handles a final line with no trailing newline", async () => {
    process.env.NVIDIA_API_KEY = "n";
    fetchMock.mockResolvedValueOnce(sse([delta("a"), delta("b").trimEnd()]));
    expect(await read(await streamChat({ messages }))).toBe("ab");
  });

  it.each([429, 500])("falls back to the second provider on %i", async (code) => {
    process.env.GEMINI_API_KEY = "g";
    process.env.NVIDIA_API_KEY = "n";
    fetchMock.mockResolvedValueOnce(status(code)).mockResolvedValueOnce(sse([delta("from nvidia")]));
    expect(await read(await streamChat({ messages }))).toBe("from nvidia");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(1)).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(bodyOf(1).model).toBe("meta/llama-3.3-70b-instruct");
  });

  it("falls back on a network error and on an empty stream", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.NVIDIA_API_KEY = "n";
    process.env.BYTEZ_API_KEY = "b";
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(sse(["data: [DONE]\n\n"]))
      .mockResolvedValueOnce(completion("<think>hmm</think>MOOD:neutral\nHi."));
    // Bytez is called non-streaming and its whole reply is emitted as one chunk.
    expect(await read(await streamChat({ messages, maxTokens: 50 }))).toBe("MOOD:neutral\nHi.");
    expect(urlOf(2)).toBe("https://api.bytez.com/models/v2/openai/v1/chat/completions");
    expect(bodyOf(2).stream).toBeUndefined();
    expect(bodyOf(2).max_completion_tokens).toBe(50);
  });

  it("falls back when no first token arrives in time", async () => {
    vi.useFakeTimers();
    process.env.GEMINI_API_KEY = "g";
    process.env.NVIDIA_API_KEY = "n";
    fetchMock
      .mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
      )
      .mockResolvedValueOnce(sse([delta("late but fine")]));
    const pending = streamChat({ messages });
    await vi.advanceTimersByTimeAsync(FIRST_TOKEN_TIMEOUT_MS + 1);
    expect(await read(await pending)).toBe("late but fine");
  });

  it("never switches provider after the first token", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.NVIDIA_API_KEY = "n";
    fetchMock.mockResolvedValueOnce(sse([delta("partial ")], true)).mockResolvedValueOnce(sse([delta("other")]));
    expect(await read(await streamChat({ messages }))).toBe("partial ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips providers without keys and honours LLM_PROVIDER_ORDER and model overrides", async () => {
    process.env.NVIDIA_API_KEY = "n";
    process.env.BYTEZ_API_KEY = "b";
    process.env.BYTEZ_MODEL = "some/model";
    process.env.LLM_PROVIDER_ORDER = "bytez, gemini, nvidia";
    fetchMock.mockResolvedValueOnce(status(503)).mockResolvedValueOnce(sse([delta("ok")]));
    expect(await read(await streamChat({ messages }))).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(0)).toContain("api.bytez.com");
    expect(bodyOf(0).model).toBe("some/model");
    expect(urlOf(1)).toContain("integrate.api.nvidia.com");
  });

  it("tries every provider in the default order, each with its own request shape", async () => {
    for (const n of NAMES) process.env[`${n}_API_KEY`] = `${n.toLowerCase()}-key`;
    expect(configuredProviders()).toEqual(["gemini", "groq", "cerebras", "nvidia", "openrouter", "bytez"]);
    for (let i = 0; i < 5; i++) fetchMock.mockResolvedValueOnce(status(429));
    fetchMock.mockResolvedValueOnce(completion("MOOD:neutral\nHi."));
    expect(await read(await streamChat({ messages, maxTokens: 77 }))).toBe("MOOD:neutral\nHi.");

    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      "https://api.groq.com/openai/v1/chat/completions",
      "https://api.cerebras.ai/v1/chat/completions",
      "https://integrate.api.nvidia.com/v1/chat/completions",
      "https://openrouter.ai/api/v1/chat/completions",
      "https://api.bytez.com/models/v2/openai/v1/chat/completions",
    ]);
    fetchMock.mock.calls.forEach((c, i) => expect(c[1].headers.Authorization).toBe(`Bearer ${NAMES[i].toLowerCase()}-key`));

    const [gemini, groq, cerebras, nvidia, openrouter, bytez] = fetchMock.mock.calls.map((_, i) => bodyOf(i));
    expect(gemini).toMatchObject({ max_tokens: 77, reasoning_effort: "minimal", stream_options: { include_usage: true } });
    expect(groq).toMatchObject({ model: "openai/gpt-oss-20b", stream: true, max_completion_tokens: 77, reasoning_effort: "low" });
    expect(groq.max_tokens).toBeUndefined();
    expect(cerebras).toMatchObject({ model: "qwen-3.8-27b", stream: true, max_completion_tokens: 77, reasoning_effort: "none" });
    expect(cerebras.stream_options).toBeUndefined();
    expect(nvidia).toEqual({ model: "meta/llama-3.3-70b-instruct", messages, temperature: 0.8, max_tokens: 77, stream: true });
    expect(openrouter).toEqual({ model: "google/gemma-4-31b-it:free", messages, temperature: 0.8, max_tokens: 77, stream: true });
    expect(bytez).toEqual({ model: "Qwen/Qwen3-4B", messages, temperature: 0.8, max_completion_tokens: 77 });
  });

  it("keeps the gemini, nvidia, bytez subset working when the new providers have no key", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.NVIDIA_API_KEY = "n";
    process.env.BYTEZ_API_KEY = "b";
    process.env.GROQ_API_KEY = ""; // blank lines copied from .env.example count as no key
    expect(configuredProviders()).toEqual(["gemini", "nvidia", "bytez"]);
    process.env.LLM_PROVIDER_ORDER = "nope, constructor, bytez, groq";
    expect(configuredProviders()).toEqual(["bytez"]);
  });

  it("reads env on every call, with per-provider model, base URL and reasoning overrides", async () => {
    process.env.GROQ_API_KEY = "q";
    process.env.GROQ_MODEL = "qwen/qwen3.8-27b";
    process.env.GROQ_BASE_URL = "https://proxy.example/v1/";
    process.env.GROQ_REASONING_EFFORT = "none";
    process.env.GEMINI_API_KEY = "g";
    process.env.GEMINI_REASONING_EFFORT = ""; // empty = send no reasoning_effort
    process.env.LLM_PROVIDER_ORDER = "groq";
    fetchMock.mockResolvedValueOnce(sse([delta("a")])).mockResolvedValueOnce(sse([delta("b")]));
    expect(await read(await streamChat({ messages }))).toBe("a");
    expect(urlOf(0)).toBe("https://proxy.example/v1/chat/completions");
    expect(bodyOf(0)).toMatchObject({ model: "qwen/qwen3.8-27b", reasoning_effort: "none" });

    process.env.LLM_PROVIDER_ORDER = "gemini";
    expect(await read(await streamChat({ messages }))).toBe("b");
    expect(urlOf(1)).toContain("generativelanguage");
    expect(bodyOf(1).reasoning_effort).toBeUndefined();
  });

  it("throws 503 naming the env vars when nothing is configured", async () => {
    const err = await streamChat({ messages }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(503);
    for (const n of NAMES) expect(err.message).toContain(`${n}_API_KEY`);
    expect(configuredProviders()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws 429 when every provider is rate limited, else 502, without leaking upstream bodies", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.NVIDIA_API_KEY = "n";
    fetchMock.mockResolvedValueOnce(status(429)).mockResolvedValueOnce(status(429));
    const limited = await streamChat({ messages }).catch((e) => e);
    expect(limited).toBeInstanceOf(LlmError);
    expect(limited.status).toBe(429);

    fetchMock.mockResolvedValueOnce(status(429)).mockResolvedValueOnce(status(500));
    const failed = await streamChat({ messages }).catch((e) => e);
    expect(failed.status).toBe(502);
    expect(failed.message).not.toContain("secret");
  });

  it("does not fall back when the caller aborts, and cancels upstream when the reader cancels", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.NVIDIA_API_KEY = "n";
    const ac = new AbortController();
    fetchMock.mockImplementationOnce(() => {
      ac.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(streamChat({ messages, signal: ac.signal })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset().mockResolvedValueOnce(sse([delta("a"), delta("b")]));
    const stream = await streamChat({ messages });
    await stream.cancel();
    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  });
});

describe("generateJson", () => {
  const schema = z.object({ summary: z.string(), level: z.enum(["solid", "strong"]) });
  const good = { summary: "ok", level: "solid" };

  it("strips code fences and leading prose, and asks Gemini for JSON mode", async () => {
    process.env.GEMINI_API_KEY = "g";
    fetchMock.mockResolvedValueOnce(completion("Sure! Here it is:\n```json\n" + JSON.stringify(good) + "\n```\nHope it helps."));
    expect(await generateJson({ messages: [{ role: "system", content: "S" }, ...messages], schema })).toEqual(good);
    const body = bodyOf(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.stream).toBeUndefined();
    expect(body.messages.filter((m: { role: string }) => m.role === "system")).toHaveLength(1);
    expect(body.messages[0].content).toContain("JSON");
  });

  it("asks for JSON mode only where the provider documents it, never streaming", async () => {
    for (const n of NAMES) process.env[`${n}_API_KEY`] = "k";
    for (let i = 0; i < 5; i++) fetchMock.mockResolvedValueOnce(status(500));
    fetchMock.mockResolvedValueOnce(completion(JSON.stringify(good)));
    expect(await generateJson({ messages, schema, maxTokens: 900 })).toEqual(good);
    const jsonMode = fetchMock.mock.calls.map((_, i) => bodyOf(i).response_format?.type);
    expect(jsonMode).toEqual(["json_object", "json_object", "json_object", undefined, "json_object", undefined]);
    for (let i = 0; i < 6; i++) expect(bodyOf(i).stream).toBeUndefined();
    expect(bodyOf(1).max_completion_tokens).toBe(900);
    expect(bodyOf(4).max_tokens).toBe(900);
  });

  it("parses bare prose-wrapped JSON without fences", async () => {
    process.env.NVIDIA_API_KEY = "n";
    fetchMock.mockResolvedValueOnce(completion(`<think>plan {x}</think>Here you go: ${JSON.stringify(good)} Thanks`));
    expect(await generateJson({ messages, schema })).toEqual(good);
    expect(bodyOf(0).response_format).toBeUndefined();
  });

  it("retries once with the validation error fed back", async () => {
    process.env.GEMINI_API_KEY = "g";
    fetchMock
      .mockResolvedValueOnce(completion('{"summary":"ok","level":"amazing"}'))
      .mockResolvedValueOnce(completion(JSON.stringify(good)));
    expect(await generateJson({ messages, schema })).toEqual(good);
    const retry = bodyOf(1).messages;
    expect(retry.at(-2)).toEqual({ role: "assistant", content: '{"summary":"ok","level":"amazing"}' });
    expect(retry.at(-1).content).toContain("level");
  });

  it("moves to the next provider after two invalid replies, and after an HTTP error", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.NVIDIA_API_KEY = "n";
    process.env.BYTEZ_API_KEY = "b";
    fetchMock
      .mockResolvedValueOnce(completion("not json at all"))
      .mockResolvedValueOnce(completion("{ still broken"))
      .mockResolvedValueOnce(status(500))
      .mockResolvedValueOnce(completion(JSON.stringify(good)));
    expect(await generateJson({ messages, schema })).toEqual(good);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(urlOf(3)).toContain("api.bytez.com");
    // A fresh provider starts from the original messages, not the previous provider's retries.
    expect(bodyOf(3).messages).toHaveLength(2);
  });

  it("throws LlmError after all providers fail", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.NVIDIA_API_KEY = "n";
    fetchMock
      .mockResolvedValueOnce(completion("nope"))
      .mockResolvedValueOnce(completion("nope"))
      .mockResolvedValueOnce(status(429));
    const err = await generateJson({ messages, schema }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(502);

    fetchMock.mockResolvedValueOnce(status(429)).mockResolvedValueOnce(status(429));
    const limited = await generateJson({ messages, schema }).catch((e) => e);
    expect(limited.status).toBe(429);
  });
});
