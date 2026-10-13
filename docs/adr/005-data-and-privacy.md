# 005. Data and privacy: nothing stored on the server for guests

Status: Accepted, 2026-10-10. Superseded in part by [ADR 009](009-accounts-and-history.md) on 2026-10-10: signed-in users' transcripts and notes are now stored. Everything below still holds for guests.

## Context
Users may say personal things while practising, and may paste a resume. The MVP had no accounts, and storing transcripts would create duties (security, deletion, consent) that an unproven product should not take on.

## Decision
A session lives only in the browser's `sessionStorage` (key `session:v1`) and disappears when the tab closes. For guests the server keeps no transcripts, notes or user records. The results page has a "Download transcript and notes" button for users who want a copy. The setup page shows this line: "Your voice is processed by your browser's speech service. Text is sent to AI providers and may be used by them under their terms."

## What changed with accounts (ADR 009)
- Signing in is optional. A guest's data is handled exactly as described above.
- For a signed-in user, the transcript, setup choices and notes of a session are saved to their account when the notes arrive, so they can be reopened from the History page. Sessions with the Friend companion (no notes) are not saved.
- The setup page adds this line for signed-in users: "Your transcripts and notes are saved to your account. You can delete them any time."
- The duties this decision avoided now apply to signed-in users, and are met as follows: access is limited to the owner by row-level security, the user can delete one session or all of them from the History page, and deleting the account in Supabase removes its sessions (`on delete cascade`).
- Audio is still never stored or sent to our server.

## Consequences
- For guests: no history, and nothing to leak or delete on our side.
- The privacy wording is deliberately plain because free provider tiers may use submitted content, and their terms and limits are unverified and can change (see ADR 001 and ADR 011).
- Guests cannot come back to an old session; signed-in users can.
- The two-calls-per-session cap on notes is still enforced in the browser only; the hourly server limit is the backstop.
- Server logs must not record transcript text. This now also covers the history routes, which log database error codes only.
