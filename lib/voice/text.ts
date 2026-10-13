// Pure helpers for the voice pipeline. No DOM, no React: covered by tests/voice.test.ts.
import { MOODS, type Mood } from "@/lib/types";

// ---- Sentence splitting ---------------------------------------------------

// A sentence ends at .!?… (plus closing quotes/brackets) followed by whitespace, or at a newline.
// ponytail: no abbreviation list ("Dr. Smith" splits in two); add one if replies start sounding choppy.
const SENTENCE_END = /[.!?…]+["'”’)\]]*\s+|\n+/g;

/** Feed streamed text in; get whole sentences out as soon as they are complete. */
export function createSentenceSplitter() {
  let buf = "";
  return {
    push(chunk: string): string[] {
      buf += chunk;
      const out: string[] = [];
      let last = 0;
      SENTENCE_END.lastIndex = 0;
      for (let m = SENTENCE_END.exec(buf); m; m = SENTENCE_END.exec(buf)) {
        const s = buf.slice(last, m.index + m[0].length).trim();
        if (s) out.push(s);
        last = m.index + m[0].length;
      }
      buf = buf.slice(last);
      return out;
    },
    /** The trailing partial sentence, once the stream has ended. */
    flush(): string[] {
      const s = buf.trim();
      buf = "";
      return s ? [s] : [];
    },
  };
}

export function splitSentences(text: string): string[] {
  const s = createSentenceSplitter();
  return [...s.push(text), ...s.flush()];
}

// ---- MOOD line ------------------------------------------------------------

const MOOD_LINE = /^\s*mood\s*:\s*([a-z-]*)[^\n]*\n/i;
// True while the buffered text could still turn out to be a MOOD line.
const MOOD_PREFIX = /^\s*(m(o(o(d(\s*(:[^\n]*)?)?)?)?)?)?$/i;
const MOOD_INLINE = new RegExp(`^\\s*mood\\s*:\\s*(${MOODS.join("|")})\\b[\\s.:-]*`, "i");
const MOOD_MAX = 40;

/** Strips an optional leading "MOOD:<mood>\n" from a chunked stream. Text it returns is safe to show/speak. */
export function createMoodParser() {
  let buf = "";
  let done = false;
  let mood: Mood | null = null;
  return {
    get mood() {
      return mood;
    },
    push(chunk: string): string {
      if (done) return chunk;
      buf += chunk;
      const m = MOOD_LINE.exec(buf);
      if (m) {
        const name = m[1].toLowerCase() as Mood;
        if (MOODS.includes(name)) mood = name;
        done = true;
        return buf.slice(m[0].length);
      }
      if (buf.length <= MOOD_MAX && MOOD_PREFIX.test(buf)) return "";
      done = true;
      // Model forgot the newline: still never show or speak the tag.
      const inline = MOOD_INLINE.exec(buf);
      if (!inline) return buf;
      mood = inline[1].toLowerCase() as Mood;
      return buf.slice(inline[0].length);
    },
    /** Call when the stream ends: releases held text unless it was a bare MOOD line. */
    end(): string {
      if (done) return "";
      done = true;
      const m = /^\s*mood\s*:\s*([a-z-]*)\s*$/i.exec(buf);
      if (!m) return buf;
      const name = m[1].toLowerCase() as Mood;
      if (MOODS.includes(name)) mood = name;
      return "";
    },
  };
}

// ---- Distress check -------------------------------------------------------

// ponytail: short phrase list, English only. It only decides whether to show a help link, so false
// positives are cheap; the companion's own prompt handles the actual response.
const DISTRESS =
  /\b(suicid(e|al)|kill(ing)? myself|end(ing)? my (own )?life|tak(e|ing) my (own )?life|(want|wanna|wish) to die|wish i (was|were) dead|better off dead|better off without me|self[ -]?harm(ing)?|(hurt|harm|cut)(ting|ing)? myself(?! (some|a bit of|a little) slack)|end it all|(dont|do not) want to (live|be alive|be here anymore)|no reason to live)\b/;

export function matchesDistress(text: string): boolean {
  return DISTRESS.test(text.toLowerCase().replace(/[’']/g, ""));
}

// ---- Mouth level ----------------------------------------------------------

export const MOUTH_ATTACK_MS = 45;
export const MOUTH_DECAY_MS = 140;

/** One-pole smoothing with a fast attack and slower decay, so the mouth reads as speech rather than jitter. */
export function smoothLevel(prev: number, target: number, dtMs: number): number {
  const tau = target > prev ? MOUTH_ATTACK_MS : MOUTH_DECAY_MS;
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tau);
  const v = prev + (target - prev) * k;
  return v < 0.005 ? 0 : Math.min(1, v);
}

/** RMS of time-domain samples (-1..1), scaled so normal speech lands around 0.4-0.9. */
export function rmsLevel(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.min(1, Math.sqrt(sum / samples.length) * 4.5);
}

/**
 * speechSynthesis exposes no audio, so fake a mouth level: a syllable-rate wobble (~4-7Hz)
 * plus a kick on each word boundary event.
 */
export function simulatedLevel(tMs: number, msSinceBoundary: number): number {
  const wobble = 0.5 + 0.5 * Math.sin(tMs * 0.033) * Math.sin(tMs * 0.0117 + 1.3);
  const kick = Math.exp(-Math.max(0, msSinceBoundary) / 110);
  return Math.min(1, Math.max(0, 0.18 + 0.42 * wobble + 0.4 * kick));
}

// ---- Browser voice choice -------------------------------------------------

type VoiceLike = { name: string; lang: string; default?: boolean };

/** First hint that matches an available voice name, else an English voice, else whatever the browser defaults to. */
export function pickVoice<V extends VoiceLike>(voices: V[], hints: string[]): V | undefined {
  for (const hint of hints) {
    const h = hint.toLowerCase();
    const v = voices.find((x) => x.name.toLowerCase().includes(h));
    if (v) return v;
  }
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  return en.find((v) => v.default) ?? en.find((v) => /^en[-_]US/i.test(v.lang)) ?? en[0];
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
