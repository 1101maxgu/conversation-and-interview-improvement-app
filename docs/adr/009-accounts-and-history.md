# 009. Optional accounts and saved history on Supabase

Status: Accepted, 2026-10-10. Reverses part of [ADR 005](005-data-and-privacy.md) for signed-in users.

## Context
Nothing was saved between visits, so users could not look back at earlier notes or see progress. The owner asked for accounts and session history, built only on free resources. Guests must keep working exactly as before.

## Decision
Use Supabase's free tier for both sign-in (Supabase Auth) and storage (Postgres).

- **Why Supabase and not Neon plus a separate auth service**: Supabase bundles auth and the database, so there is one account, one set of keys and one dashboard, and the database can check the signed-in user itself (`auth.uid()` in row-level security policies). Neon is only a database: it would need a second service for sign-in and our own code to tie the two together, which is more to build and more places to get authorisation wrong.
- **Email magic link, no passwords**: there is no password to store, leak, reset or reuse. The cost is that sign-in depends on email delivery.
- **Row-level security is the boundary; no service-role key**: the server talks to Supabase with the public anon key plus the user's own session cookie (`lib/supabase/server.ts`). Policies on `public.sessions` allow select, insert, update and delete only where `user_id = auth.uid()`. The API also checks the user and filters by user id, so authorisation is enforced twice, but a bug in the API still cannot cross accounts because the database refuses. A service-role key would bypass all of that, so the app does not have one.
- **The user is verified, not trusted**: `getUser()` uses `auth.getClaims()`, which checks the access token's signature; the cookie's contents are never used as-is.
- **Saving is automatic and best effort**: when the notes arrive on the results page, a signed-in user's session is saved under an id generated in the browser, so saving again (after "Regenerate notes") updates the same row. A failed save shows a small message and never blocks the page.
- **Per-user cap of 200 sessions** (`MAX_SAVED_SESSIONS`), plus a 1 MB request limit and a matching size check in the table, to protect the free tier's 500 MB database.
- **Deletion**: one session, or everything ("Delete all my data"), from the History page.
- **The layout stays static**: the header's sign-in state is read in the browser by a small client component, so the root layout does not read cookies and remains compatible with `cacheComponents`. `proxy.ts` refreshes the session cookie on page navigations only when a Supabase cookie is present.

## Consequences
- Signed-in users' transcripts and notes are now stored, so privacy matters more: see ADR 005 for the wording shown to users and the delete controls.
- **Free projects pause after about a week without activity.** The first requests after a pause fail until the owner restores the project in the dashboard. History calls fail soft (503 with a friendly message); practising and notes are unaffected.
- The built-in email service sends only a few emails per hour; a custom SMTP provider is needed before real sign-up traffic.
- The magic link must be opened in the browser that requested it (PKCE). The callback also accepts the `token_hash` form if the email template is changed to allow other devices.
- The cap is checked before the insert, so two simultaneous first saves can overshoot it by one. It is a free-tier guard, not a hard quota.
- Pins in the notes sidebar are kept per browser tab, not per saved session.
- Deleting a user in the Supabase dashboard removes their sessions (`on delete cascade`). There is no self-service "delete my account" yet, only "delete all my data".
- With no Supabase environment variables the feature is off: no sign-in link, the history routes answer 503, and nothing else changes.
