import { buildSystemPrompt } from "../../prompt";
import type { Selections } from "../../types";
import { CORE, EXAMPLES, FOCUS, OPINIONS, PERSONALITY, REACTION, SETTINGS } from "./knowledge";

type Turn = { role: "user" | "assistant"; content: string };
type Reaction = keyof typeof REACTION;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/** Content words (5+ letters), lower-cased. */
const keys = (s: string) => new Set(s.toLowerCase().match(/[a-z']{5,}/g) ?? []);
const BRIDGE = /^\W*(that reminds me|speaking of|by the way|oh,? by the way|on another note|random question|changing the subject)/i;
// ponytail: silence marker guessed; confirm what the client sends for a silent turn and extend this regex
const SILENCE = /^\s*(\.{2,}|…|\(?\[?silence\]?\)?|\*?silence\*?)?\s*$/i;

/**
 * Cheap, deterministic read of the recent turns. At most three reactions, most useful first.
 * Heuristic ceiling: wording and word counts only, no understanding of meaning.
 */
export function detectConversationReactions(messages: Turn[]): Reaction[] {
  const users = messages.filter((m) => m.role === "user");
  const last = users.at(-1);
  if (!last) return [];
  const found: Reaction[] = [];
  const prevBot = messages.findLast((m, i) => m.role === "assistant" && i < messages.lastIndexOf(last))?.content ?? "";

  if (SILENCE.test(last.content)) return ["silence"];

  const n = words(last.content);
  const prevKeys = keys(prevBot);
  const overlap = [...keys(last.content)].some((k) => prevKeys.has(k));
  const bridged = BRIDGE.test(last.content);

  if (n > 90) found.push("monologue");
  const recent = users.slice(-2);
  if (recent.length === 2 && recent.every((m) => words(m.content) < 4)) found.push("oneWord");
  if (last.content.includes("?") && overlap && n >= 4) found.push("goodFollowUp");
  if (bridged) found.push("smoothShift");
  else if (prevKeys.size >= 3 && n >= 6 && !overlap && !last.content.includes("?")) found.push("ignored");

  const last3 = users.slice(-3);
  if (last3.length === 3 && last3.every((m) => !m.content.includes("?"))) found.push("noQuestions");
  if (last3.length === 3) {
    const sets = last3.map((m) => keys(m.content));
    if ([...sets[0]].some((k) => sets[1].has(k) && sets[2].has(k))) found.push("stuckTopic");
  }

  const recentTurns = messages.slice(-6);
  const userWords = recentTurns.filter((m) => m.role === "user").reduce((a, m) => a + words(m.content), 0);
  const botWords = recentTurns.filter((m) => m.role === "assistant").reduce((a, m) => a + words(m.content), 0);
  if (recentTurns.length >= 4 && userWords / Math.max(1, userWords + botWords) > 0.75 && !found.includes("monologue")) found.push("userDominates");

  return found.slice(0, 3);
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/**
 * Backstory ingredients. Derived from the first thing the partner said, so it is stable across turns without
 * state. Before the opening exists there is nothing to hash, so one pick is random; it then lives in the history.
 */
export function backstoryHint(messages: Turn[]): string {
  const first = messages.find((m) => m.role === "assistant")?.content;
  const h = first ? hash(first) : Math.floor(Math.random() * 1e6);
  const hint = `${SETTINGS[h % SETTINGS.length]}, someone who ${OPINIONS[(h >> 4) % OPINIONS.length]}`;
  return `# Your backstory\nIf you need a detail about your life, you could draw on: ${hint}. Invent the rest. Anything you've already said in this conversation takes priority and stays true.`;
}

/** The existing persona prompt plus conversation knowledge, chosen for this personality, focus and recent turns. */
export function buildConversationPrompt(selections: Selections, messages: Turn[]): string {
  const reactions = detectConversationReactions(messages).map((r) => `- ${REACTION[r]}`);
  const parts = [
    CORE,
    PERSONALITY[selections.personality] && `# Your personality\n${PERSONALITY[selections.personality]}`,
    FOCUS[selections.focus] && `# Practice focus\n${FOCUS[selections.focus]}`,
    backstoryHint(messages),
    EXAMPLES,
    reactions.length && `# Right now\n${reactions.join("\n")}`,
  ];
  return `${buildSystemPrompt("conversation", selections)}\n\n${parts.filter(Boolean).join("\n\n")}`;
}

export { CONVERSATION_STANDARD } from "./knowledge";
