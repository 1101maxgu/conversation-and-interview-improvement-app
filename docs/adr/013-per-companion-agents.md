# 013. One specialised agent per companion

Status: Accepted, 2026-10-11

## Context
All six companions shared one prompt builder with a persona paragraph each. The owner wants each companion to be a specialist that already knows its field before a user arrives. Providers are free tier only, so there is no fine-tuning: "trained" means researched knowledge committed to the repo.

## Decision
Each companion has a folder under `lib/agents/<id>/`:
- `knowledge.ts`: distilled guidance, per-option snippets, reaction hints, worked examples, and a "what good looks like" standard. Written in our own words; `SOURCES.md` lists what each part was drawn from (mostly practitioner guides, not studies).
- `index.ts`: builds the turn's system prompt as the shared persona prompt (`lib/prompt.ts`) plus the knowledge, plus hints picked by cheap wording heuristics on the user's last message.
- `plan.ts` (interview, case, sales, presentation): one structured model call at Start (`POST /api/plan`) that returns a tailored plan: interview questions, a case file with a code-verified answer key, a buyer profile with ordered objections, or audience questions. Conversation and friend have no plan: improvising is the point.

`lib/agents/index.ts` is the registry. The browser stores the plan in session data and sends it back each turn; the server treats it as untrusted, validates it per companion (`validPlan`), drops it if invalid, and embeds it as delimited data. The standard is appended to the rubric focus in `lib/rubrics.ts` so notes and the live partner agree; case notes also get the answer key.

## Consequences
- Prompts are roughly twice as long. Small free models may ignore parts; `scripts/<id>-demo.ts` plays a scripted user against each agent to check.
- A plan adds one request per session and up to a 6 second wait on Start; any failure starts without a plan.
- Reaction hints read wording only and can misfire. They are hints, never rules, and never replace safety rule 8.
