# 012. Prompt and rubric ideas taken from other open-source interview apps

Status: Accepted, 2026-10-10

## Context
Before tuning the companion prompts and the notes rubrics we read how five comparable open-source projects prompt their interviewers and structure feedback, to see where ours were weaker. Licence as reported by GitHub on 2026-10-10:

| Repository | Licence | What we read |
|---|---|---|
| Tameyer41/liftoff | MIT | feedback prompt (`pages/api/generate.ts`) |
| GitDaksh/interviewx | none detected (the plan listed it as MIT) | interviewer prompt and feedback schema (`constants/index.ts`, commented out there) |
| adrianhajdin/ai_mock_interviews | none stated | interviewer prompt, feedback schema and feedback prompt |
| Neamal/jask | none detected | interviewer agent instructions (`agent/agent.py`) |
| fashton28/Horizon | none detected | interviewer agent prompts (`agent/main.py`) |

Because three or four of the five have no licence, all of them were treated as read-only: ideas only.

## Decision
Nothing was copied. No text, question lists or schema from any of these repositories is in this codebase; every prompt and rubric line is our own wording.

They added little. All five use one generic interviewer prompt with numeric scores over fixed categories, which we deliberately do not do (see 004). The ideas we did take, each restated in our own words:
- An explicit way to end: when the user says they are done, the companion closes in character instead of asking another question (base rule 11 in `lib/prompt.ts`). Ours points to "Get notes" rather than promising a follow-up.
- Feedback should be honest about weak answers rather than only encouraging: the interview and case rubric criteria now name the weak patterns more concretely.

The other changes made in the same round come from ordinary interviewing practice, not from these repositories: a limit on follow-ups per answer, varying the competency asked about, harder technical questions after a good answer, the case interviewer checking the candidate's maths and closing after the recommendation, and buyers raising objections in a realistic order and revealing needs only when asked.

## Consequences
- No licence obligations arise from this work.
- If text from any of these projects is ever wanted verbatim, check the licence again first; only liftoff clearly permits it today.
- Whether the new wording improves replies is unproven until `npm run eval` has been run with real keys.
