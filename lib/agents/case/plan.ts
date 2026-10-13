import { z } from "zod";
import { generateJson, type LlmMessage } from "../../llm";
import type { Selections } from "../../types";

/** Only digits, spaces, dots, + - * / and brackets: evaluated by evalExpr below, never by eval. */
const EXPR = /^[\d\s.+\-*/()]+$/;

/** The case file, made once per session. Also validates plans sent back by the client. */
export const casePlanSchema = z.object({
  client: z.string().max(80),
  situation: z.string().max(400),
  question: z.string().max(240),
  facts: z.array(z.string().max(160)).min(2).max(8),
  data: z.array(z.string().max(160)).min(2).max(10),
  calculations: z
    .array(
      z.object({
        ask: z.string().max(160),
        expr: z.string().max(120).regex(EXPR),
        unit: z.string().max(40),
        steps: z.string().max(300),
        answer: z.string().max(100),
      }),
    )
    .min(1)
    .max(4),
  questions: z.array(z.string().max(200)).min(3).max(6),
  solution: z.string().max(500),
  rootCause: z.string().max(240),
  recommendation: z.string().max(300),
});
export type CasePlan = z.infer<typeof casePlanSchema>;

/** Tiny arithmetic evaluator (+ - * / brackets, unary minus). Returns null for anything it cannot parse. */
export function evalExpr(src: string): number | null {
  if (!EXPR.test(src)) return null;
  const t = src.match(/\d+\.?\d*|\.\d+|[-+*/()]/g) ?? [];
  if (t.join("") !== src.replace(/\s/g, "")) return null;
  let i = 0;
  const factor = (): number => {
    const x = t[i++];
    if (x === "-") return -factor();
    if (x === "(") {
      const v = expr();
      if (t[i++] !== ")") return NaN;
      return v;
    }
    return Number(x);
  };
  const term = (): number => {
    let v = factor();
    while (t[i] === "*" || t[i] === "/") v = t[i++] === "*" ? v * factor() : v / factor();
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (t[i] === "+" || t[i] === "-") v = t[i++] === "+" ? v + term() : v - term();
    return v;
  };
  const v = expr();
  return i === t.length && Number.isFinite(v) ? v : null;
}

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * The model's arithmetic is not trusted: every calculation is recomputed from its expression.
 * A calculation that cannot be parsed is dropped. A wrong stated answer is replaced by the computed one.
 */
export function verifyCalculations(plan: CasePlan): CasePlan {
  const calculations = plan.calculations.flatMap((c) => {
    const v = evalExpr(c.expr);
    if (v === null) return [];
    // Compare the numbers written in the answer with the computed value. A substring test would let "100" pass for 10.
    const stated = (c.answer.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const ok = stated.some((n) => Math.abs(n - v) <= Math.max(0.005, Math.abs(v) * 0.005));
    return [ok ? c : { ...c, answer: `${fmt(v)} ${c.unit}`.trim(), steps: `${c.expr} = ${fmt(v)}`.slice(0, 300) }];
  });
  if (!calculations.length) throw new Error("Case plan has no verifiable calculation");
  return { ...plan, calculations };
}

/** What the file must contain per case type. */
const TYPE_SPEC: Record<string, string> = {
  "market-sizing":
    "Market sizing. 'data' holds reference figures you would give only if asked for a typical value (population, household count, price point), 2 to 4 round numbers. Calculations are the main estimation chain (2 to 3 steps) ending in the yearly market size. solution: the segmentation and steps. rootCause: the key driver of the estimate.",
  profitability:
    "Profitability. 'data' holds revenue and cost lines for last year and this year (price, volume, cost per unit, fixed costs), consistent so profit falls by a clear amount. Exactly one root cause (for example one cost line up, or volume down in one segment). Calculations: current profit, the size of the gap, and the effect of the root cause.",
  "market-entry":
    "Market entry. 'data' holds market size, growth, competitor shares, client capabilities and entry cost. Calculations: market size times a target share, and a break-even or payback on the entry cost. solution: attractive or not, can the client win, how to enter, and a go or no-go.",
  "m-and-a":
    "Acquisition. 'data' holds the target's revenue and profit, the asking price, the client's rationale and the synergy figures. Calculations: standalone value or multiple, annual synergies, payback or value against price. solution: fit, value, synergies, price, risks, and a buy or walk-away view.",
};

const SYSTEM = `You write the secret case file for a spoken mock consulting case interview. Reply with one JSON object only.

Rules:
1. Case type: {SPEC}
2. Invent a realistic client with a short name, a clear situation and ONE question for the candidate (under 60 spoken words together).
3. All numbers are round and mental-maths friendly (multiples of 5, 10, 20, 25, 50; whole millions). Never more than two significant digits unless it is a plain multiple.
4. Every number you use must agree everywhere: facts, data, calculations, solution. Do not contradict yourself.
5. "facts" are things the interviewer says when asked (business model, goal, timeline, constraints), each under 20 words. "data" are single lines the interviewer reads out one at a time on request, each under 20 words.
6. Each calculation: "ask" is what the candidate would be asked to compute. "expr" is ONE arithmetic expression using only digits, + - * / and brackets, no words or units, that produces the answer in the stated "unit". "steps" shows the arithmetic in words. "answer" is the final figure with its unit. The code recomputes "expr", so make it exact.
7. "questions" are the interviewer's own questions in order for an interviewer-led case (3 to 6): usually structure first, then analysis, a calculation, brainstorming or a risk, and finally a recommendation.
8. "solution" is the model structure and the logic of the right answer. "rootCause" is the single key insight the candidate should reach. "recommendation" is the answer you would accept.
9. Plain speakable English, no markdown.

JSON shape: {"client": string, "situation": string, "question": string, "facts": string[], "data": string[], "calculations": [{"ask": string, "expr": string, "unit": string, "steps": string, "answer": string}], "questions": string[], "solution": string, "rootCause": string, "recommendation": string}`;

export function buildCasePlanPrompt(selections: Selections): LlmMessage[] {
  const type = selections.type ?? "profitability";
  return [
    { role: "system", content: SYSTEM.replace("{SPEC}", TYPE_SPEC[type] ?? TYPE_SPEC.profitability) },
    { role: "user", content: `Write the case file. Case type: ${type}. Make it fresh: pick an industry at random from retail, logistics, healthcare, energy, food, software, travel, manufacturing.` },
  ];
}

export async function generateCasePlan(selections: Selections, signal?: AbortSignal): Promise<CasePlan> {
  const plan = await generateJson({ messages: buildCasePlanPrompt(selections), schema: casePlanSchema, maxTokens: 1800, temperature: 0.9, attempts: 1, signal });
  return verifyCalculations(plan);
}
