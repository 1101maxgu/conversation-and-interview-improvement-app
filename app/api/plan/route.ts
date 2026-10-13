// POST /api/plan: one session-start plan for companions whose agent has one (interview, case, sales, presentation).
import { z } from "zod";
import { agents } from "@/lib/agents";
import { getCompanion } from "@/lib/companions";
import { LIMITS, MAX_SELECTION_KEYS, jsonError, rateLimit, readJson } from "@/lib/guard";
import { LlmError } from "@/lib/llm";
import { cleanSelections } from "@/lib/prompt";
import { getUser } from "@/lib/supabase/server";

const bodySchema = z.object({
  companionId: z.string().max(32),
  selections: z
    .record(z.string().max(64), z.string().max(LIMITS.maxFreeTextChars))
    .refine((r) => Object.keys(r).length <= MAX_SELECTION_KEYS, "Too many selections."),
});

export async function POST(req: Request) {
  const userId = (await getUser())?.id;
  const limited =
    (await rateLimit(req, "plan", LIMITS.planPerMin, 60_000, userId)) ??
    (await rateLimit(req, "plan-hour", LIMITS.planPerHour, 3_600_000, userId));
  if (limited) return limited;

  const read = await readJson(req);
  if ("error" in read) return read.error;
  const parsed = bodySchema.safeParse(read.body);
  if (!parsed.success) return jsonError(400, "Invalid plan request.");

  const companion = getCompanion(parsed.data.companionId);
  const generatePlan = companion && agents[companion.id].generatePlan;
  if (!companion || !generatePlan) return jsonError(404, "This companion has no plan.");

  const selections = cleanSelections(companion, parsed.data.selections);
  if (companion.groups.some((g) => g.required && !selections[g.id])) return jsonError(400, "Setup is incomplete.");

  try {
    return Response.json(await generatePlan(selections, req.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (err instanceof LlmError && err.status === 429) return jsonError(429, "Planning is busy right now.");
    // The client treats any failure as "no plan" and starts with the playbook alone.
    return jsonError(err instanceof LlmError && err.status === 503 ? 503 : 502, "Could not plan the session.");
  }
}
