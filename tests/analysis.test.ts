import { describe, expect, it } from "vitest";
import { computeStats } from "@/lib/analysis";
import type { Message } from "@/lib/types";

const user = (content: string, t = 0): Message => ({ role: "user", content, t });
const bot = (content: string, t = 0): Message => ({ role: "assistant", content, t });
const fillersOf = (content: string) => computeStats([user(content, 5000)], 5000).fillers;

function expectSane(stats: ReturnType<typeof computeStats>) {
  for (const n of [stats.userWords, stats.wpm, stats.fillerCount, stats.talkRatio, ...Object.values(stats.fillers)]) {
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  }
  expect(Number.isInteger(stats.wpm)).toBe(true);
  expect(stats.talkRatio).toBeLessThanOrEqual(1);
}

describe("computeStats: words and talk ratio", () => {
  it("counts user words, contractions as one word, unicode-aware", () => {
    const s = computeStats([user("I don't think it's naïve, señor.", 4000)], 4000);
    expect(s.userWords).toBe(6);
  });

  it("talkRatio is user words over all words", () => {
    const s = computeStats([bot("one two three", 1000), user("four five six seven eight nine", 5000)], 6000);
    expect(s.userWords).toBe(6);
    expect(s.talkRatio).toBeCloseTo(6 / 9, 2);
  });
});

describe("computeStats: wpm", () => {
  const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

  it("uses the gap since the previous message when it is plausible", () => {
    // companion finished speaking at 2s; then 30 words in 12s = 150 wpm
    const s = computeStats([bot("Tell me about yourself.", 2000), user(words(30), 14_000)], 20_000);
    expect(s.wpm).toBe(150);
  });

  it("clamps long thinking pauses to the slow bound", () => {
    const s = computeStats([bot("Hi.", 1000), user(words(30), 301_000)], 301_000);
    expect(s.wpm).toBe(90);
  });

  it("clamps impossibly short gaps to the fast bound", () => {
    const s = computeStats([bot("Hi.", 1000), user(words(30), 1001)], 2000);
    expect(s.wpm).toBe(220);
  });

  it("measures the first message from session start", () => {
    const s = computeStats([user(words(20), 8000)], 8000);
    expect(s.wpm).toBe(150);
  });

  it("falls back to duration * talkRatio when timestamps are unusable", () => {
    // all t = 0; user has 30 of 60 words; 24s * 0.5 = 12s -> 150 wpm
    const s = computeStats([bot(words(30), 0), user(words(30), 0)], 24_000);
    expect(s.wpm).toBe(150);
  });

  it("is 0 when timestamps and duration are both unusable", () => {
    expect(computeStats([user(words(30), 0)], 0).wpm).toBe(0);
    expect(computeStats([user(words(30), Number.NaN)], Number.NaN).wpm).toBe(0);
  });
});

describe("computeStats: fillers", () => {
  it("counts hesitation variants", () => {
    expect(fillersOf("Um, I uh, think, umm, er, hmm, uhh that works")).toEqual({ um: 2, uh: 2, er: 1, hmm: 1 });
  });

  it("counts multi-word and single-word fillers without double counting", () => {
    const s = computeStats([user("You know, I mean, it was sort of, kind of basically actually literally fine.", 9000)], 9000);
    expect(s.fillers).toEqual({
      "you know": 1,
      "i mean": 1,
      "sort of": 1,
      "kind of": 1,
      basically: 1,
      actually: 1,
      literally: 1,
    });
    expect(s.fillerCount).toBe(7);
  });

  it("does not count literal uses of the two-word fillers", () => {
    expect(fillersOf("What kind of role is it? Do you know what I mean?")).toEqual({});
  });

  it("does not count 'like' as a verb or preposition", () => {
    expect(fillersOf("I like dogs. It looks like rain. I would like a job like that. I'd like to, yes.")).toEqual({});
    expect(fillersOf("It was like a dream, and he's like me. I enjoy fruit, like apples.")).toEqual({});
    expect(fillersOf("Like I said, there are things I like, such as hiking.")).toEqual({});
  });

  it("counts 'like' as a filler when it clearly is one", () => {
    expect(fillersOf("Like, I didn't know.").like).toBe(1);
    expect(fillersOf("It was, like, really hard.").like).toBe(1);
    expect(fillersOf("And it's like, what do I do now?").like).toBe(1);
    expect(fillersOf("I was like no way, and she was like why not.").like).toBe(2);
    expect(fillersOf("The project was, like really big.").like).toBe(1);
  });

  it("counts 'so' only as a sentence-initial marker followed by a pause", () => {
    expect(fillersOf("So, I started the project. So... it went well. So um we shipped.").so).toBe(3);
    expect(fillersOf("So I think it worked. Thank you so much. I did it so that we could ship, and so we did.")).toEqual({});
  });

  it("is conservative on unpunctuated speech-recognition text", () => {
    const f = fillersOf("so i think i like teamwork and it feels like a good fit like i said um i was like wow you know");
    expect(f.like).toBe(1); // only the quotative "i was like wow"
    expect(f.so).toBeUndefined();
    expect(f).toEqual({ like: 1, um: 1, "you know": 1 });
  });

  it("ignores fillers in assistant messages and reports only non-zero entries", () => {
    const s = computeStats([bot("Um, basically, you know.", 1000), user("Yes I agree.", 3000)], 3000);
    expect(s.fillers).toEqual({});
    expect(s.fillerCount).toBe(0);
  });
});

describe("computeStats: guards", () => {
  it("empty transcript", () => {
    const s = computeStats([], 0);
    expect(s).toEqual({ userWords: 0, wpm: 0, fillerCount: 0, fillers: {}, talkRatio: 0 });
  });

  it("only assistant messages", () => {
    const s = computeStats([bot("Hello there, welcome.", 1000)], 5000);
    expect(s).toEqual({ userWords: 0, wpm: 0, fillerCount: 0, fillers: {}, talkRatio: 0 });
  });

  it("a single one-word message with zero duration", () => {
    const s = computeStats([user("Hi", 0)], 0);
    expect(s.userWords).toBe(1);
    expect(s.talkRatio).toBe(1);
    expectSane(s);
  });

  it("never returns NaN/Infinity or throws on odd input", () => {
    const odd = [
      { role: "user", content: "hello there", t: Number.POSITIVE_INFINITY },
      { role: "user", content: "", t: -5 },
      { role: "assistant", content: "ok", t: Number.NaN },
      { role: "user", content: "!!! ... ???", t: 10 },
      { role: "user", content: undefined, t: undefined },
      null,
    ] as unknown as Message[];
    for (const d of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 60_000]) {
      expectSane(computeStats(odd, d));
    }
    expectSane(computeStats(undefined as unknown as Message[], 1000));
  });
});
