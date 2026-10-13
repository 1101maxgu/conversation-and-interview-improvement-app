// Measured session stats. Pure functions: no LLM, no I/O, never NaN/Infinity, never throws.
import type { Message, Stats } from "@/lib/types";

// A token is a word (contractions stay whole: "don't", "it's") or a run of punctuation.
const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[,;:.!?…—–]+|-{2,}/gu;
const IS_WORD = /^[\p{L}\p{N}]/u;

function tokenize(text: unknown): string[] {
  return (String(text ?? "").toLowerCase().replace(/’/g, "'").match(TOKEN) ?? []);
}

const isWord = (tok: string | undefined): tok is string => !!tok && IS_WORD.test(tok);
/** Comma, dash, ellipsis: a mid-sentence pause. */
const isPause = (tok: string | undefined) => !!tok && !IS_WORD.test(tok) && (/[,;:…—–-]/.test(tok) || tok.includes(".."));
/** Start of the message or after . ! ? */
const isSentenceStart = (prev: string | undefined) => !prev || (!isWord(prev) && !isPause(prev));

function hesitation(word: string): string | null {
  if (/^u+h*m+$/.test(word)) return "um"; // um, umm, uhm
  if (/^u+h+$/.test(word)) return "uh"; // uh, uhh
  if (/^e+r+m*$/.test(word)) return "er"; // er, err, erm
  if (/^h+m+$/.test(word)) return "hmm"; // hm, hmm
  return null;
}

const SINGLE_FILLERS = new Set(["basically", "actually", "literally"]);

// ponytail: naive context rules, tuned to under-count. Upgrade path is a POS tagger if accuracy ever matters.
// Words before a two-word filler that make it literal: "what kind of", "do you know", "what I mean".
const NOT_FILLER_AFTER: Record<string, Set<string>> = {
  "kind of": new Set(["what", "which", "this", "that", "a", "the", "any", "some", "every", "one", "same", "each", "another", "different", "right", "wrong"]),
  "sort of": new Set(["what", "which", "this", "that", "a", "the", "any", "some", "every", "one", "same", "each", "another", "different", "right", "wrong"]),
  "you know": new Set(["do", "did", "does", "if", "would", "will", "can", "could", "should", "how", "what", "once", "when", "until", "unless", "let", "sure"]),
  "i mean": new Set(["what", "that", "how", "do", "did"]),
};

// "like" directly after these is a verb or preposition: "I like", "would like", "looks like".
const LIKE_VERB_CONTEXT = new Set([
  "i", "you", "we", "they", "people", "would", "i'd", "you'd", "we'd", "they'd", "he'd", "she'd", "to", "do", "does", "did",
  "don't", "doesn't", "didn't", "really", "also", "always", "never", "look", "looks", "looked", "feel", "feels", "felt",
  "sound", "sounds", "sounded", "seem", "seems", "seemed", "something", "anything", "nothing", "things", "stuff", "just",
]);
// After ", like" these make it a filler ("and, like, I froze"); a noun would make it "such as" ("fruit, like apples").
const LIKE_FILLER_FOLLOWERS = new Set([
  "i'm", "i've", "he", "she", "we", "they", "it", "it's", "there", "really", "so", "very", "totally", "super",
  "just", "kind", "sort", "maybe", "not", "basically", "literally", "actually", "honestly",
]);
// Quotative "I was like …" / "she's like …", unless a comparison follows ("it was like a dream", "he's like me").
const QUOTATIVE_SUBJECTS = new Set(["i", "he", "she", "we", "they", "you"]);
const QUOTATIVE_CONTRACTIONS = new Set(["i'm", "he's", "she's", "we're", "they're", "you're"]);
const COMPARISON_FOLLOWERS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their", "me", "him", "us",
  "them", "you", "nothing", "something", "anything", "any", "some", "one", "when", "if",
]);

function isFillerLike(tokens: string[], i: number): boolean {
  const prev = tokens[i - 1];
  const next = tokens[i + 1];
  // "Like, …", "it's like, …", ", like, …". Not "things I like, such as …".
  if (isPause(next)) return !isWord(prev) || !LIKE_VERB_CONTEXT.has(prev);
  if (!isWord(next)) return false;
  if (isPause(prev)) return LIKE_FILLER_FOLLOWERS.has(next);
  const quotative =
    (isWord(prev) && QUOTATIVE_CONTRACTIONS.has(prev)) ||
    ((prev === "was" || prev === "were") && QUOTATIVE_SUBJECTS.has(tokens[i - 2] ?? ""));
  // Anything else ("I like dogs", "like I said", unpunctuated speech) is ambiguous: do not count.
  return quotative && !COMPARISON_FOLLOWERS.has(next);
}

/** "so" only as a sentence-initial discourse marker followed by a comma/pause or a hesitation: "So, …", "So um …". */
function isFillerSo(tokens: string[], i: number): boolean {
  const next = tokens[i + 1];
  // Still sentence-initial after leading hesitations: "Um, so, …".
  let p = i - 1;
  while (p >= 0 && (isPause(tokens[p]) || hesitation(tokens[p]) !== null)) p--;
  return isSentenceStart(tokens[p]) && (isPause(next) || (isWord(next) && hesitation(next) !== null));
}

/** One left-to-right pass; a matched two-word filler consumes both tokens, so nothing is counted twice. */
function countFillers(tokens: string[], into: Record<string, number>): void {
  const add = (key: string) => {
    into[key] = (into[key] ?? 0) + 1;
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!isWord(tok)) continue;

    const pair = `${tok} ${tokens[i + 1] ?? ""}`;
    const literalAfter = NOT_FILLER_AFTER[pair];
    if (literalAfter) {
      if (!literalAfter.has(tokens[i - 1] ?? "")) add(pair);
      i++;
      continue;
    }

    const hes = hesitation(tok);
    if (hes) add(hes);
    else if (SINGLE_FILLERS.has(tok)) add(tok);
    else if (tok === "like" && isFillerLike(tokens, i)) add("like");
    else if (tok === "so" && isFillerSo(tokens, i)) add("so");
  }
}

const SLOWEST_WPM = 90;
const FASTEST_WPM = 220;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function computeStats(messages: Message[], durationMs: number): Stats {
  const list = Array.isArray(messages) ? messages : [];
  const fillers: Record<string, number> = {};
  let userWords = 0;
  let allWords = 0;
  let speakingMs = 0;
  let timestampsUsable = true;
  let prevT = 0;

  for (const m of list) {
    const tokens = tokenize(m?.content);
    const words = tokens.filter(isWord).length;
    allWords += words;
    const t = Number(m?.t);

    if (m?.role === "user" && words > 0) {
      userWords += words;
      countFillers(tokens, fillers);

      // Speaking-time estimate. Messages only carry `t`: the session stamps a companion message when it
      // finishes speaking and a user message when they stop speaking. So the gap since the previous message
      // is the user's thinking time plus the speech itself.
      // Clamp the result to what the word count makes plausible (90-220 wpm) so pauses and odd timestamps
      // cannot produce absurd values. Approximate by nature: it reads slow when the user thinks before answering.
      const gap = t - prevT;
      if (Number.isFinite(gap) && gap > 0) {
        speakingMs += clamp(gap, (words / FASTEST_WPM) * 60_000, (words / SLOWEST_WPM) * 60_000);
      } else {
        timestampsUsable = false;
      }
    }
    if (Number.isFinite(t) && t >= 0) prevT = t;
  }

  const talkRatio = allWords > 0 ? userWords / allWords : 0;

  if (!timestampsUsable) {
    // Fallback: assume the user spoke for their share of the session, still within the plausible range.
    const estimate = safe(durationMs) * talkRatio;
    speakingMs =
      estimate > 0 ? clamp(estimate, (userWords / FASTEST_WPM) * 60_000, (userWords / SLOWEST_WPM) * 60_000) : 0;
  }

  const wpm = userWords > 0 && speakingMs > 0 ? Math.round(userWords / (speakingMs / 60_000)) : 0;
  const fillerCount = Object.values(fillers).reduce((a, b) => a + b, 0);

  return {
    userWords,
    wpm: safe(wpm),
    fillerCount,
    fillers,
    talkRatio: Math.round(safe(talkRatio) * 1000) / 1000,
  };
}
