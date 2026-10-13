// Plays a scripted user against shy and chatty conversation partners: `npx tsx scripts/conversation-demo.ts`.
// Makes live model calls: run it deliberately (free-tier rate limits).
import { existsSync } from "node:fs";
import { buildConversationPrompt } from "../lib/agents/conversation";
import { streamChat } from "../lib/llm";
import { toLlmMessages } from "../lib/prompt";
import type { Message } from "../lib/types";

const SCRIPT = [
  "Yeah.", // one-word answer
  "Wait, you said you almost missed something? What happened?", // good follow-up
  "Oh that's funny. So this one time my sister and I drove across the country, and we got lost in a town with one road, and the car broke down, and a farmer helped us, and then we stayed for dinner and his wife made this huge pie and we talked until midnight about everything, it was honestly one of the best trips of my life.", // monologue
  "...", // silence
];

async function run(personality: string) {
  const sel = { personality, focus: "follow-ups" };
  console.log(`\n=== ${personality.toUpperCase()} ===`);
  const m: Message[] = [];
  let t = 0;
  const turn = async (user?: string) => {
    if (user) m.push({ role: "user", content: user, t: (t += 20000) });
    const stream = await streamChat({ messages: toLlmMessages(buildConversationPrompt(sel, m), m), maxTokens: 150 });
    const r = stream.getReader();
    const d = new TextDecoder();
    let out = "";
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      out += d.decode(value);
    }
    console.log(user ? `\nUSER: ${user}` : "", "\nPARTNER:", out.replace(/\n/g, " | "));
    m.push({ role: "assistant", content: out.replace(/^MOOD:\w+\n/, ""), t: (t += 5000) });
  };
  await turn();
  for (const line of SCRIPT) await turn(line);
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  Object.assign(process.env, { NODE_ENV: "test" });
  for (const p of ["shy", "chatty"]) await run(p);
}

main();
