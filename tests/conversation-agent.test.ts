import { describe, expect, it } from "vitest";
import { backstoryHint, buildConversationPrompt, detectConversationReactions } from "../lib/agents/conversation";
import { CONVERSATION_STANDARD, REACTION } from "../lib/agents/conversation/knowledge";

const sel = { personality: "shy", focus: "follow-ups" };
const user = (content: string) => ({ role: "user" as const, content });
const bot = (content: string) => ({ role: "assistant" as const, content });

describe("detectConversationReactions", () => {
  it("flags one-word replies, monologues and silence", () => {
    expect(detectConversationReactions([bot("Hi, I'm Sam."), user("Hi."), bot("Nice weather."), user("Yeah.")])).toContain("oneWord");
    expect(detectConversationReactions([bot("How was your week?"), user("word ".repeat(120))])).toContain("monologue");
    expect(detectConversationReactions([bot("So, what do you do?"), user("...")])).toEqual(["silence"]);
  });
  it("spots a good follow-up, an ignored hook and a smooth shift", () => {
    const hook = bot("I almost missed my train because of a goat.");
    expect(detectConversationReactions([hook, user("A goat? What happened with the train?")])).toContain("goodFollowUp");
    expect(detectConversationReactions([hook, user("My weekend was pretty relaxing and quiet.")])).toContain("ignored");
    expect(detectConversationReactions([hook, user("That reminds me, do you like hiking?")])).toContain("smoothShift");
  });
  it("notices no questions back, a repeated topic and a dominated chat", () => {
    const m = [
      bot("Hey."), user("I love football, my football team won."),
      bot("Cool."), user("Football season is amazing, honestly."),
      bot("Hm."), user("Our football stadium is huge and loud and great."),
    ];
    const r = detectConversationReactions(m);
    expect(r).toContain("noQuestions");
    expect(r).toContain("stuckTopic");
    expect(r.length).toBeLessThanOrEqual(3);
  });
  it("is quiet when there is nothing to react to", () => {
    expect(detectConversationReactions([])).toEqual([]);
  });
});

describe("conversation agent prompt", () => {
  it("keeps the base rules and adds knowledge, personality, focus and examples", () => {
    const p = buildConversationPrompt(sel, [bot("Hi"), user("Yes."), bot("Hm."), user("No.")]);
    expect(p).toContain("voice practice partner");
    expect(p).toContain("MOOD:neutral, MOOD:happy");
    expect(p).toContain("# How a real person talks");
    expect(p).toContain("Shy:");
    expect(p).toContain("follow-up questions");
    expect(p).toContain(REACTION.oneWord);
    expect(p).toContain("Never write \"um\" or \"uh\"");
  });
  it("derives a stable backstory from the first assistant message", () => {
    const a = [bot("Hi, I'm Mia."), user("Hello")];
    expect(backstoryHint(a)).toBe(backstoryHint([...a, bot("Nice."), user("Thanks")]));
    expect(backstoryHint(a)).toContain("# Your backstory");
  });
  it("exposes the standard used by the notes rubric", () => {
    expect(CONVERSATION_STANDARD).toContain("Conversation standard");
  });
});
