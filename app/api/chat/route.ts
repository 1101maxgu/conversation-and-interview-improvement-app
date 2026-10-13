import { agentSystemPrompt } from "../../../lib/agents";
import { getCompanion } from "../../../lib/companions";
import { chatRequestSchema, jsonError, LIMITS, rateLimit, readJson } from "../../../lib/guard";
import { LlmError, streamChat } from "../../../lib/llm";
import { cleanSelections, toLlmMessages } from "../../../lib/prompt";
import { getUser } from "../../../lib/supabase/server";

// No segment config: cacheComponents rejects `runtime`/`dynamic` exports. Node.js is the default
// runtime and POST handlers always run at request time.

// Gemini's thinking tokens count against the limit, so leave a little headroom over ~3 sentences.
const MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS) || 200;

const STREAM_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
};

export async function POST(req: Request) {
  // Per signed-in user, else per IP. getUser() is null for guests without touching cookies or the network.
  const limited = await rateLimit(req, "chat", LIMITS.chatPerMin, 60_000, (await getUser())?.id);
  if (limited) return limited;

  const read = await readJson(req);
  if ("error" in read) return read.error;
  const parsed = chatRequestSchema.safeParse(read.body);
  if (!parsed.success) return jsonError(400, "Invalid chat request.");
  const { companionId, selections, messages, resume, plan } = parsed.data;

  const companion = getCompanion(companionId);
  if (!companion) return jsonError(404, "Unknown companion.");

  // Turn cap: end long sessions with a canned closing line instead of another model call.
  if (messages.filter((m) => m.role === "user").length > LIMITS.maxTurns) {
    const closer = companion.notes
      ? 'We have covered a lot today, so this is a good place to stop. End the session and press "Get notes" to see how it went.'
      : "We have been chatting for ages and I have loved it. Let's call it here for now, and come back any time.";
    return new Response(`MOOD:happy\n${closer}`, { headers: STREAM_HEADERS });
  }

  try {
    const system = agentSystemPrompt(companion.id, cleanSelections(companion, selections), messages, plan);
    const stream = await streamChat({
      messages: toLlmMessages(system, messages, resume),
      maxTokens: MAX_TOKENS,
      signal: req.signal,
    });
    return new Response(stream, { headers: STREAM_HEADERS });
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (err instanceof LlmError) {
      if (err.status === 429) return jsonError(429, "Your companion is busy right now. Please try again in a moment.");
      if (err.status === 503) return jsonError(503, "The AI service is not set up yet.");
      return jsonError(502, "Your companion could not reply. Please try again.");
    }
    if (process.env.NODE_ENV !== "production") console.error("[chat]", err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
