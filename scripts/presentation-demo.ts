// Prints sample question plans, then plays a scripted presenter: `npx tsx scripts/presentation-demo.ts`.
// Makes live model calls; run it only when free-tier rate limits allow.
import { existsSync } from "node:fs";
import { buildPresentationPrompt } from "../lib/agents/presentation";
import { generatePresentationPlan } from "../lib/agents/presentation/plan";
import { streamChat } from "../lib/llm";
import { toLlmMessages } from "../lib/prompt";
import type { Message } from "../lib/types";

const SAMPLES = [
  { audience: "exec", topic: "Quarterly budget proposal: we ask for 1.2 million to expand support staff, expecting ticket backlog to fall 30 percent by Q3, funded by pausing the office move." },
  { audience: "technical", topic: "Machine learning research: a small transformer fine-tuned on 50,000 labelled clinical notes reaches 91 percent F1 at detecting medication errors, beating a rules baseline at 78 percent." },
  { audience: "hostile", topic: "School policy proposal: start the school day at 9am instead of 8, based on a sleep study at two pilot schools, with bus routes rescheduled." },
];

const SCRIPT = [
  "That is a great question, and it really depends on a lot of factors.",
  "Well, so basically we looked at many things over a long time, and the team did a lot of work on the process, and then there were various stakeholders, and we also considered the alignment with strategy, and the roadmap, and several other items that came up in discussions along the way, so overall it is a complex picture with many moving parts and we want to be careful to get it right for everyone involved.",
  "In the pilot, attendance rose twelve percent over one term, and I would expect about half of that at scale.",
];

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  Object.assign(process.env, { NODE_ENV: "test" });
  const plans = [];
  for (const s of SAMPLES) {
    const plan = await generatePresentationPlan(s);
    plans.push(plan);
    console.log(`\n=== ${s.audience}: ${s.topic.slice(0, 60)}`);
    plan.questions.forEach((q, i) => console.log(`${i + 1}. [${q.kind}: ${q.aspect}] ${q.question}${q.followUp ? `\n     follow-up: ${q.followUp}` : ""}`));
  }

  const sel = SAMPLES[2];
  const plan = plans[2];
  const m: Message[] = [];
  let t = 0;
  const turn = async (user?: string) => {
    if (user) m.push({ role: "user", content: user, t: (t += 20000) });
    const stream = await streamChat({ messages: toLlmMessages(buildPresentationPrompt(sel, m, plan), m), maxTokens: 200 });
    const r = stream.getReader();
    const d = new TextDecoder();
    let out = "";
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      out += d.decode(value);
    }
    console.log(user ? `\nPRESENTER: ${user}` : "\n--- hostile audience session", "\nAUDIENCE:", out.replace(/\n/g, " | "));
    m.push({ role: "assistant", content: out.replace(/^MOOD:\w+\n/, ""), t: (t += 5000) });
  };
  await turn();
  for (const line of SCRIPT) await turn(line);
}

main();
