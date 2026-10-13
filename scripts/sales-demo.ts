// Prints 3 sample buyer plans, then plays a scripted salesperson against the first buyer: `npx tsx scripts/sales-demo.ts`.
// Makes live model calls: run it only when free-tier rate limits allow.
import { existsSync } from "node:fs";
import { buildSalesPrompt } from "../lib/agents/sales";
import { generateSalesPlan } from "../lib/agents/sales/plan";
import { streamChat } from "../lib/llm";
import { toLlmMessages } from "../lib/prompt";
import type { Message } from "../lib/types";

const CASES = [
  { buyer: "skeptic", stage: "demo", product: "A scheduling app for small dental clinics" },
  { buyer: "busy-exec", stage: "cold-call", product: "Enterprise security software that monitors employee laptops" },
  { buyer: "price-focused", stage: "negotiation", product: "A subscription meal-prep delivery service for offices" },
];

const SCRIPT = [
  "We have automated reminders, a patient portal, analytics dashboards, and integrations with everything.",
  "How are you handling no-shows today, and what does that cost your practice?",
  "Okay, I can take fifteen percent off right now if that helps.",
  "Could we run a two week pilot with your front desk and meet Thursday to review the results?",
];

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  Object.assign(process.env, { NODE_ENV: "test" });
  const plans = [];
  for (const sel of CASES) {
    const plan = await generateSalesPlan(sel);
    plans.push(plan);
    console.log(`\n=== PLAN: ${sel.buyer} / ${sel.stage} / ${sel.product}\n${JSON.stringify(plan, null, 2)}`);
  }
  const sel = CASES[0];
  const plan = plans[0];
  const m: Message[] = [];
  let t = 0;
  const turn = async (user?: string) => {
    if (user) m.push({ role: "user", content: user, t: (t += 20000) });
    const stream = await streamChat({ messages: toLlmMessages(buildSalesPrompt(sel, m, plan), m), maxTokens: 200 });
    const r = stream.getReader();
    const d = new TextDecoder();
    let out = "";
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      out += d.decode(value);
    }
    console.log(user ? `\nSALESPERSON: ${user}` : "", "\nBUYER:", out.replace(/\n/g, " | "));
    m.push({ role: "assistant", content: out.replace(/^MOOD:\w+\n/, ""), t: (t += 5000) });
  };
  await turn();
  for (const line of SCRIPT) await turn(line);
}

main();
