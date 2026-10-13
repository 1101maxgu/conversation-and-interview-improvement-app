// Prints 3 sample case files, then plays a scripted candidate against the case interviewer: `npx tsx scripts/case-demo.ts`.
// Makes live model calls (4 plan calls plus 4 chat turns): run only when free-tier limits allow.
import { existsSync } from "node:fs";
import { buildCasePrompt } from "../lib/agents/case";
import { generateCasePlan } from "../lib/agents/case/plan";
import { streamChat } from "../lib/llm";
import { toLlmMessages } from "../lib/prompt";
import type { Message } from "../lib/types";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  Object.assign(process.env, { NODE_ENV: "test" });

  const types = ["profitability", "market-sizing", "market-entry"];
  const plans = [];
  for (const type of types) {
    const p = await generateCasePlan({ type, mode: "candidate-led", hints: "nudges" });
    plans.push(p);
    console.log(`\n=== ${type} ===\n${JSON.stringify(p, null, 2)}`);
  }

  const sel = { type: "profitability", mode: "candidate-led", hints: "nudges" };
  const plan = plans[0];
  const first = Number(plan.calculations[0].answer.replace(/,/g, "").match(/-?\d+(\.\d+)?/)?.[0] ?? 10);
  const SCRIPT = [
    "Thanks. Before I structure, what is the client's goal and over what time frame? Then I would split profit into revenue and costs, revenue as price times volume and costs as fixed and variable, and start with costs.",
    `For the first calculation I get ${first * 3}, so that is where the gap comes from.`,
    "I think they should just renegotiate with suppliers and cut costs, that is my answer.",
  ];

  const m: Message[] = [];
  let t = 0;
  const turn = async (user?: string) => {
    if (user) m.push({ role: "user", content: user, t: (t += 20000) });
    const stream = await streamChat({ messages: toLlmMessages(buildCasePrompt(sel, m, plan), m), maxTokens: 200 });
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
