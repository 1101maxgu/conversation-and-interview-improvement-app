// Plays a scripted candidate against the interview agent with a live plan: `npx tsx scripts/interview-demo.ts`.
import { existsSync } from "node:fs";
import { buildInterviewPrompt } from "../lib/agents/interview";
import { generatePlan } from "../lib/agents/interview/plan";
import { streamChat } from "../lib/llm";
import { toLlmMessages } from "../lib/prompt";
import type { Message } from "../lib/types";

const SCRIPT = [
  "I'm a hard worker and a team player, I really love working with people.",
  "We built a dashboard last year and it went well, we shipped it and we were all happy.",
  "I cut report time from six hours to one by automating the pipeline, and adoption hit 80 percent.",
];

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  Object.assign(process.env, { NODE_ENV: "test" });
  const sel = { type: "behavioral", style: "skeptical", role: "Product manager", company: "Microsoft" };
  const plan = await generatePlan(sel);
  const m: Message[] = [];
  let t = 0;
  const turn = async (user?: string) => {
    if (user) m.push({ role: "user", content: user, t: (t += 20000) });
    const stream = await streamChat({ messages: toLlmMessages(buildInterviewPrompt(sel, m, plan), m), maxTokens: 200 });
    const r = stream.getReader();
    const d = new TextDecoder();
    let out = "";
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      out += d.decode(value);
    }
    console.log(user ? `\nCANDIDATE: ${user}` : "", "\nINTERVIEWER:", out.replace(/\n/g, " | "));
    m.push({ role: "assistant", content: out.replace(/^MOOD:\w+\n/, ""), t: (t += 5000) });
  };
  await turn();
  for (const line of SCRIPT) await turn(line);
}

main();
