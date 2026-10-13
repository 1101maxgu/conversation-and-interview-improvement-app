# 006. Safety: step out of character when a user is in distress

Status: Accepted, 2026-10-10

## Context
A practice partner that feels friendly, and the Friend companion in particular, may hear things that are more serious than interview nerves. The app is not a counselling service and must not act like one.

## Decision
Three small layers:
1. A rule in the shared base prompt: if the user says something distressing, the companion steps out of character, gives a short supportive message and points to professional help.
2. The same rule in the notes prompt: the summary first acknowledges the distress and encourages reaching out to someone the user trusts or a local crisis line, before any performance feedback.
3. A small keyword check in the browser that shows a help link.

The notes prompt also forbids diagnosing the user or commenting on accent, voice quality or anything a transcript cannot show.

## Consequences
- The response is simple and consistent across all six companions.
- It depends on the model following the prompt and on a keyword list, so it will miss some cases and sometimes trigger when not needed. It is a safety net, not a guarantee.
- Transcripts are treated as untrusted data inside a delimited block, so text in a session is not meant to be able to switch these rules off.
