import { describe, expect, it } from "vitest";
import { buildFriendPrompt, detectFriendReactions } from "../lib/agents/friend";
import { CORE, EXAMPLES, REACTION, VIBE } from "../lib/agents/friend/knowledge";
import { buildSystemPrompt } from "../lib/prompt";

const user = (content: string) => ({ role: "user" as const, content });
const bot = (content: string) => ({ role: "assistant" as const, content });

describe("detectFriendReactions", () => {
  it("spots big mentions, advice requests, low mood, good news, jokes and one-word replies", () => {
    expect(detectFriendReactions("Yeah my dad's in hospital but anyway, work is fine")).toContain("bigMention");
    expect(detectFriendReactions("What should I do about my landlord?")).toContain("advice");
    expect(detectFriendReactions("I've just been feeling really lonely lately")).toContain("low");
    expect(detectFriendReactions("This week was so stressful, my boss dumped everything on me and I'm fried")).toContain("venting");
    expect(detectFriendReactions("I got the job!")).toContain("goodNews");
    expect(detectFriendReactions("haha yeah that was a disaster")).toContain("joke");
    expect(detectFriendReactions("Anyway, random question for you")).toContain("subject");
    expect(detectFriendReactions("Fine.")).toEqual(["oneWord"]);
  });
  it("stays quiet on ordinary chat and caps at two hints", () => {
    expect(detectFriendReactions("We went to the park and had a picnic with the dog yesterday afternoon")).toEqual([]);
    expect(detectFriendReactions("")).toEqual([]);
    expect(detectFriendReactions("My mom passed away. What should I do? I'm so lonely haha").length).toBeLessThanOrEqual(2);
  });
});

describe("friend agent prompt", () => {
  const sel = { vibe: "blunt" };
  it("keeps persona, knowledge, vibe, examples and hints", () => {
    const p = buildFriendPrompt(sel, [bot("Hey!"), user("I got the job!")]);
    expect(p).toContain("You are the user's friend");
    expect(p).toContain(CORE);
    expect(p).toContain(VIBE.blunt);
    expect(p).toContain(EXAMPLES.blunt);
    expect(p).toContain(REACTION.goodNews);
  });
  it("covers every vibe and has no notes standard", () => {
    for (const id of ["supportive", "playful", "blunt", "chill"]) {
      expect(VIBE[id]).toBeTruthy();
      expect(EXAMPLES[id]).toContain("MOOD:");
      expect(buildFriendPrompt({ vibe: id }, [])).toContain(VIBE[id]);
    }
  });
  it("leaves safety rule 8 untouched and authoritative", () => {
    const base = buildSystemPrompt("friend", sel);
    const rule8 = base.split("\n").find((l) => l.startsWith("8. Safety comes first"));
    expect(rule8).toBeTruthy();
    const p = buildFriendPrompt(sel, [user("I don't want to be here anymore")]);
    expect(p.startsWith(base)).toBe(true);
    expect(p).toContain(rule8!);
    expect(p).toContain("rule 8");
  });
  it("never tells the model to give advice unprompted", () => {
    const unprompted = /\b(give|offer|suggest|provide)\b[^.]*\b(advice|solutions?|tips|a plan)\b/i;
    for (const [key, hint] of Object.entries(REACTION)) {
      if (key === "advice") continue;
      const withoutNegations = hint.replace(/(do not|no|never)[^.]*\./gi, "");
      expect(withoutNegations, key).not.toMatch(unprompted);
    }
    expect(REACTION.venting).toMatch(/do not offer advice/i);
    expect(REACTION.advice).toMatch(/asking/i);
    expect(CORE).toMatch(/unless they ask/i);
  });
  it("keeps the spoken style rules", () => {
    expect(CORE).toContain('Never write "um" or "uh"');
    expect(CORE).toContain("Not a therapist or coach");
  });
});
