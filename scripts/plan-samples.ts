// Prints sample interview plans for human review: `npm run plan-samples`. Needs a provider key in .env.local.
import { existsSync } from "node:fs";
import { generatePlan } from "../lib/agents/interview/plan";
import { cleanSelections } from "../lib/prompt";
import { companions } from "../lib/companions";

const CASES = [
  { type: "behavioral", style: "friendly", role: "Product manager", company: "Microsoft", jobDescription: "Own the roadmap for a Teams collaboration feature area. Work with engineering and design, define success metrics, run experiments, talk to enterprise customers.", resume: "2 years as an associate PM at a SaaS startup. Launched an onboarding flow that lifted activation by 12%." },
  { type: "technical", style: "skeptical", role: "Junior financial analyst", company: "a regional bank", jobDescription: "Build monthly forecasts in Excel, reconcile ledgers, support credit risk reviews.", resume: "Finance graduate, internship in accounts payable." },
  { type: "panel", style: "stern", role: "Registered nurse, medical-surgical ward", company: "City General Hospital", jobDescription: "", resume: "" },
];

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  Object.assign(process.env, { NODE_ENV: "test" });
  for (const c of CASES) {
    const sel = cleanSelections(companions.interview, c);
    console.log(`\n=== ${c.role} @ ${c.company} (${c.type}, ${c.style}) ===`);
    const started = Date.now();
    try {
      const plan = await generatePlan(sel);
      console.log(`${((Date.now() - started) / 1000).toFixed(1)}s | family: ${plan.roleFamily} | style: ${plan.companyStyle}`);
      plan.questions.forEach((q, i) => console.log(`${i + 1}. [${q.kind} / ${q.skill}] ${q.question}${q.probe ? `\n     probe: ${q.probe}` : ""}`));
    } catch (e) {
      console.log("FAILED:", e instanceof Error ? e.message : e);
    }
  }
}

main();
