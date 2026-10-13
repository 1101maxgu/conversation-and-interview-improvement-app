# 004. Feedback: one "Get notes" at the end, levels instead of scores

Status: Accepted, 2026-10-10

## Context
The product exists to help people improve, so feedback matters. The questions were when to give it and in what form.

## Decision
There is no feedback during a session. At the end the user presses "Get notes" once, and `POST /api/notes` returns a summary, an overall Level, a Level and reason for each rubric dimension, measured stats and four to eight note cards. If the user asks for feedback mid-session, the companion says in character that notes are available at the end.

- Mid-session coaching notes were rejected by the owner in favour of the single "Get notes" step.
- Numeric scores were replaced by qualitative levels (Needs work / Solid / Strong). Numbers assigned by a model are inconsistent and misleading: they vary between runs and look more precise than they are.
- The Friend companion gets no feedback at all: no notes, stats or labels.

## Consequences
- One model request for feedback per session; the client caps it at two, and a per-IP hourly limit is the server backstop.
- Stats are computed in code (`lib/analysis.ts`), never by the model, so they are repeatable.
- The route normalises model output: rubric labels and order are forced, stray "7/10" text is removed, ids are assigned by the server.
- If every model fails, the user still gets a 200 response with stats and stats-based cards.
- Changing what is assessed is a data edit in `lib/rubrics.ts`.
