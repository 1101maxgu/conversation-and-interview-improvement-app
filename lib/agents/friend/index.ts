import { buildSystemPrompt } from "../../prompt";
import type { Selections } from "../../types";
import { BOUNDARIES, CORE, EXAMPLES, REACTION, VIBE } from "./knowledge";

type Turn = { role: "user" | "assistant"; content: string };
type Reaction = keyof typeof REACTION;

const BIG = /\b(passed away|died|funeral|diagnos\w*|hospital|surgery|cancer|got fired|laid off|lost my job|breakup|broke up|divorce\w*|pregnan\w*|miscarriage|evict\w*|moving away)\b/i;
const ADVICE = /\b(what (?:should|would) (?:i|you)|what do you think|any advice|should i|what would you do|do you think i should)\b/i;
const EMOTION = /\b(stress\w*|overwhelm\w*|anxious|anxiety|sad|down|tired|exhausted|burn(?:t|ed) out|lonely|alone|angry|furious|upset|frustrat\w*|rough|awful|terrible|worried|nervous|drained)\b/i;
const LOW = /\b(sad|lonely|alone|exhausted|burn(?:t|ed) out|overwhelm\w*|anxious|anxiety|drained|down lately|stressed out)\b/i;
const GOOD = /\b(i got the|got promoted|promotion|passed|i won|engaged|great news|good news|so excited|i'?m excited|finally got|accepted|got in|made it)\b/i;
const JOKE = /\b(lol|haha+|hehe|lmao|just kidding|jk)\b/i;
const SUBJECT = /\b(anyway|anyways|by the way|btw|random question|speaking of|changing the subject|on another note)\b/i;

/**
 * Cheap, deterministic read of the user's last message. At most two hints, most useful first.
 * Heuristic ceiling: wording only, no understanding. Conservative on purpose, and it never
 * touches rule 8, which stays in the base prompt.
 */
export function detectFriendReactions(message: string): Reaction[] {
  const text = message.trim();
  if (!text) return [];
  const n = text.split(/\s+/).length;
  const found: Reaction[] = [];
  if (BIG.test(text)) found.push("bigMention");
  if (ADVICE.test(text)) found.push("advice");
  if (LOW.test(text)) found.push("low");
  else if (EMOTION.test(text) && n >= 8) found.push("venting");
  if (GOOD.test(text)) found.push("goodNews");
  if (JOKE.test(text)) found.push("joke");
  if (SUBJECT.test(text)) found.push("subject");
  if (n <= 2 && found.length === 0) found.push("oneWord");
  return found.slice(0, 2);
}

/** The existing friend persona prompt plus warmth knowledge, the chosen vibe and hints for the last message. */
export function buildFriendPrompt(selections: Selections, messages: Turn[]): string {
  const vibe = selections.vibe ?? "";
  const last = messages.findLast((m) => m.role === "user")?.content ?? "";
  const parts = [CORE, VIBE[vibe] && `# Your vibe in practice\n${VIBE[vibe]}`, EXAMPLES[vibe]];
  const hints = detectFriendReactions(last).map((r) => `- ${REACTION[r]}`);
  if (hints.length) parts.push(`# About their last message\n${hints.join("\n")}`);
  parts.push(BOUNDARIES);
  return `${buildSystemPrompt("friend", selections)}\n\n${parts.filter(Boolean).join("\n\n")}`;
}
