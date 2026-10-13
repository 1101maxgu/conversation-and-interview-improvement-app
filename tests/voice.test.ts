import { describe, expect, it } from "vitest";
import {
  createMoodParser,
  createSentenceSplitter,
  matchesDistress,
  pickVoice,
  rmsLevel,
  simulatedLevel,
  smoothLevel,
  splitSentences,
} from "@/lib/voice/text";

/** Runs a reply through the MOOD parser in the given chunks. */
function parse(chunks: string[]) {
  const p = createMoodParser();
  const text = chunks.map((c) => p.push(c)).join("") + p.end();
  return { text, mood: p.mood };
}

describe("sentence splitter", () => {
  it("splits complete sentences and keeps the trailing partial for flush", () => {
    const s = createSentenceSplitter();
    expect(s.push("Hi! How are you? I'm…")).toEqual(["Hi!", "How are you?"]);
    expect(s.flush()).toEqual(["I'm…"]);
    expect(s.flush()).toEqual([]);
  });

  it("works when sentences arrive in arbitrary chunks", () => {
    const s = createSentenceSplitter();
    const out: string[] = [];
    for (const chunk of ["Nice to me", "et you", ". Tell me abo", "ut yourself", "."]) out.push(...s.push(chunk));
    expect(out).toEqual(["Nice to meet you."]);
    expect(s.flush()).toEqual(["Tell me about yourself."]);
  });

  it("does not split decimals, and treats newlines and closing quotes as boundaries", () => {
    expect(splitSentences("It costs 3.5 dollars. OK")).toEqual(["It costs 3.5 dollars.", "OK"]);
    expect(splitSentences('She said "go." Then left.\nBye')).toEqual(['She said "go."', "Then left.", "Bye"]);
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("MOOD parser", () => {
  it("strips the mood line", () => {
    expect(parse(["MOOD:happy\nHello there."])).toEqual({ text: "Hello there.", mood: "happy" });
  });

  it("handles the line split across chunks, odd casing and whitespace", () => {
    expect(parse(["MO", "OD", ": Cur", "ious \n", "Why ", "is that?"])).toEqual({ text: "Why is that?", mood: "curious" });
    expect(parse([" mood : SERIOUS\r\nRight."])).toEqual({ text: "Right.", mood: "serious" });
  });

  it("passes text through untouched when there is no mood line", () => {
    expect(parse(["Hello", " there."])).toEqual({ text: "Hello there.", mood: null });
    expect(parse(["Mood swings are normal."])).toEqual({ text: "Mood swings are normal.", mood: null });
    expect(parse(["M"])).toEqual({ text: "M", mood: null });
  });

  it("never leaks the tag: unknown mood, missing newline, or mood line only", () => {
    expect(parse(["MOOD:grumpy\nHi."])).toEqual({ text: "Hi.", mood: null });
    expect(parse(["MOOD: happy Hello there, how are you doing today my friend?"])).toEqual({
      text: "Hello there, how are you doing today my friend?",
      mood: "happy",
    });
    expect(parse(["MOOD:happy"])).toEqual({ text: "", mood: "happy" });
  });
});

describe("distress matcher", () => {
  it("matches self-harm and suicide phrases", () => {
    for (const t of [
      "Honestly I want to kill myself",
      "I've been feeling suicidal lately",
      "sometimes I don't want to be alive",
      "I just want to end it all",
      "I keep thinking about self-harm",
      "I WANT TO DIE",
    ]) {
      expect(matchesDistress(t), t).toBe(true);
    }
  });

  it("ignores ordinary figures of speech", () => {
    for (const t of [
      "This interview is killing me",
      "I nearly died of embarrassment",
      "My last pitch died on stage",
      "I cut myself some slack",
      "Tell me about yourself",
      "",
    ]) {
      expect(matchesDistress(t), t).toBe(false);
    }
  });
});

describe("mouth level", () => {
  it("opens fast, closes slower, and settles exactly at 0", () => {
    const up = smoothLevel(0, 1, 33);
    const down = 1 - smoothLevel(1, 0, 33);
    expect(up).toBeGreaterThan(0.4);
    expect(down).toBeLessThan(up);
    let v = 1;
    for (let i = 0; i < 60; i++) v = smoothLevel(v, 0, 33);
    expect(v).toBe(0);
    expect(smoothLevel(0.5, 0.5, 33)).toBeCloseTo(0.5);
    expect(smoothLevel(0.2, 5, 10_000)).toBeLessThanOrEqual(1);
  });

  it("rms and simulated levels stay within 0-1", () => {
    expect(rmsLevel(new Float32Array(64))).toBe(0);
    expect(rmsLevel([])).toBe(0);
    expect(rmsLevel(new Float32Array(64).fill(1))).toBe(1);
    expect(rmsLevel(new Float32Array(64).fill(0.1))).toBeCloseTo(0.45);
    for (let t = 0; t < 3000; t += 37) {
      const l = simulatedLevel(t, t % 400);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
  });
});

describe("pickVoice", () => {
  const voices = [
    { name: "Microsoft Hedda - German", lang: "de-DE" },
    { name: "Microsoft David - English (United States)", lang: "en-US" },
    { name: "Google UK English Female", lang: "en-GB" },
  ];

  it("uses the first hint that matches, in hint order", () => {
    expect(pickVoice(voices, ["Samantha", "google uk english female", "Microsoft David"])?.name).toBe(
      "Google UK English Female",
    );
  });

  it("falls back to an English voice, or nothing", () => {
    expect(pickVoice(voices, ["Nope"])?.lang).toBe("en-US");
    expect(pickVoice([voices[0]], ["Nope"])).toBeUndefined();
    expect(pickVoice([], [])).toBeUndefined();
  });
});
