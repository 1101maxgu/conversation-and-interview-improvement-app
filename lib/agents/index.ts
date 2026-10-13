import type { z } from "zod";
import type { CompanionId, Selections } from "../types";
import { buildCasePrompt, casePlanSchema, generateCasePlan } from "./case";
import { buildConversationPrompt } from "./conversation";
import { buildFriendPrompt } from "./friend";
import { buildInterviewPrompt } from "./interview";
import { generatePlan as generateInterviewPlan, planSchema as interviewPlanSchema } from "./interview/plan";
import { buildPresentationPrompt, generatePresentationPlan, presentationPlanSchema } from "./presentation";
import { buildSalesPrompt, generateSalesPlan, salesPlanSchema } from "./sales";

type Turn = { role: "user" | "assistant"; content: string };

/** A companion's specialist: its own knowledge-backed prompt, and for some a session-start plan. */
type Agent = {
  /** System prompt for one turn. `plan` is whatever the browser sent back: it is checked here and dropped if invalid. */
  buildPrompt: (selections: Selections, messages: Turn[], plan?: unknown) => string;
  generatePlan?: (selections: Selections, signal?: AbortSignal) => Promise<unknown>;
  /** The plan if it is valid for this companion, else undefined. */
  parsePlan?: (plan: unknown) => unknown;
};

/** Wraps an agent that has a plan, keeping the plan's type inside: callers only ever pass untrusted input. */
function planned<P>(agent: {
  buildPrompt: (selections: Selections, messages: Turn[], plan?: P) => string;
  planSchema: z.ZodType<P>;
  generatePlan: (selections: Selections, signal?: AbortSignal) => Promise<P>;
}): Agent {
  const parsePlan = (raw: unknown): P | undefined => {
    if (raw === undefined) return undefined;
    const parsed = agent.planSchema.safeParse(raw);
    // A bad plan is dropped, never an error: the session carries on without it. Say so while developing.
    if (!parsed.success && process.env.NODE_ENV === "development") console.warn("[agents] plan dropped:", parsed.error.issues[0]);
    return parsed.success ? parsed.data : undefined;
  };
  return {
    buildPrompt: (selections, messages, raw) => agent.buildPrompt(selections, messages, parsePlan(raw)),
    generatePlan: agent.generatePlan,
    parsePlan,
  };
}

export const agents: Record<CompanionId, Agent> = {
  interview: planned({ buildPrompt: buildInterviewPrompt, planSchema: interviewPlanSchema, generatePlan: generateInterviewPlan }),
  case: planned({ buildPrompt: buildCasePrompt, planSchema: casePlanSchema, generatePlan: generateCasePlan }),
  sales: planned({ buildPrompt: buildSalesPrompt, planSchema: salesPlanSchema, generatePlan: generateSalesPlan }),
  presentation: planned({ buildPrompt: buildPresentationPrompt, planSchema: presentationPlanSchema, generatePlan: generatePresentationPlan }),
  conversation: { buildPrompt: buildConversationPrompt },
  friend: { buildPrompt: buildFriendPrompt },
};

/** The plan if it is valid for this companion, else undefined. */
export function validPlan(companionId: CompanionId, plan: unknown): unknown {
  return agents[companionId].parsePlan?.(plan);
}

/** System prompt for one chat turn. `selections` must already be cleaned (lib/prompt.ts cleanSelections). */
export function agentSystemPrompt(companionId: CompanionId, selections: Selections, messages: Turn[], plan?: unknown): string {
  return agents[companionId].buildPrompt(selections, messages, plan);
}
