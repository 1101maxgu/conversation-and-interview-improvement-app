// Plays a scripted user against the friend agent in two vibes: `npx tsx scripts/friend-demo.ts`.
// Makes live model calls, so run it only when free-tier rate limits allow.
import { existsSync } from "node:fs";
import { buildFriendPrompt } from "../lib/agents/friend";
import { streamChat } from "../lib/llm";
import { toLlmMessages } from "../lib/prompt";
import type { Message } from "../lib/types";

const SCRIPT = [
  "Hey! Not much, just been watching a lot of shows.",
  "Honestly this week has been rough. My manager keeps dumping work on me and I'm so tired.",
  "Oh, and I got into that evening pottery class I applied for!",
  "What do you think I should do about my manager?",
];

async function run(vibe: string) {
  const sel = { vibe };
  const m: Message[] = [];
  let t = 0;
  console.log(`\n===== VIBE: ${vibe} =====`);
  const turn = async (user?: string) => {
    if (user) m.push({ role: "user", content: user, t: (t += 20000) });
    const stream = await streamChat({ messages: toLlmMessages(buildFriendPrompt(sel, m), m), maxTokens: 200 });
    const r = stream.getReader();
    const d = new TextDecoder();
    let out = "";
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      out += d.decode(value);
    }
    console.log(user ? `\nUSER: ${user}` : "", "\nFRIEND:", out.replace(/\n/g, " | "));
    m.push({ role: "assistant", content: out.replace(/^MOOD:\w+\n/, ""), t: (t += 5000) });
  };
  await turn();
  for (const line of SCRIPT) await turn(line);
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  Object.assign(process.env, { NODE_ENV: "test" });
  for (const vibe of ["supportive", "blunt"]) await run(vibe);
}

main();
