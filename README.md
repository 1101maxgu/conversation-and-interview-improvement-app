# AI Communication Practice

A website for job seekers and students to practise speaking out loud with an AI companion. Pick one of six cartoon companions (conversation, interview, sales, case interview, presentation Q&A, or just a friend), tune its personality, and talk to it by voice in real time. There is no feedback during the session. At the end, press **Get notes** once to see a summary, qualitative levels (Needs work / Solid / Strong, never a numeric score), measured stats and a set of note cards. The Friend companion gives no feedback at all.

## Quick start

```bash
cp .env.example .env.local   # then add at least one provider key (Gemini, Groq, Cerebras, NVIDIA NIM, OpenRouter or Bytez)
npm install
npm run dev
```

Open http://localhost:3000 in **Chrome** and allow the microphone. Without any provider key the pages load, but the companions cannot reply (the API answers 503).

Everything else in `.env.example` is optional. With no Supabase values there are no accounts and no sign-in link, and the app works for guests exactly as before. With no Upstash values the rate limiter runs in memory.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest, `tests/**/*.test.ts`) |
| `npm run smoke` | End-to-end check against a running server (`BASE_URL`, default `http://localhost:3000`). Model checks are reported as SKIPPED when no provider key is set. |
| `npm run eval` | Prompt checks against the live providers (needs keys). Manual, not part of CI. |

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request with Node 24: `npm ci`, then `typecheck`, `lint`, `test` and `build`. It needs no secrets: the build and the unit tests pass with no environment variables set. `smoke` and `eval` stay manual because they need a running server and live keys.

## Architecture

Next.js App Router, TypeScript. A session lives in the browser's `sessionStorage`, and for guests the server only proxies model calls. Signed-in users also get their finished sessions saved to a Supabase Postgres table (optional, see [Accounts and history](#accounts-and-history-optional)). The shared contracts are in `lib/types.ts`.

| Part | Owns | Files |
|---|---|---|
| 1. Shell, setup, results, character art | Design system, home, setup, results and goodbye pages, notes sidebar, six skins | `app/page.tsx`, `app/setup/[companion]/`, `app/results/`, `app/goodbye/`, `components/ui/`, `components/notes/`, `components/characters/` |
| 2. Live session, voice, avatar rig | Session page, speech in and out, animation rig | `app/session/`, `components/avatar/`, `lib/voice/` |
| 3. Companions, prompts, chat, LLM layer | Companion and voice data, system prompts, provider fallback | `lib/types.ts`, `lib/companions.ts`, `lib/voices.ts`, `lib/prompt.ts`, `lib/llm.ts`, `app/api/companions/`, `app/api/chat/` |
| 4. Notes, analysis, guards, docs | Feedback route, measured stats, rubrics, validation and rate limits, tests | `app/api/notes/`, `lib/analysis.ts`, `lib/rubrics.ts`, `lib/guard.ts`, `tests/`, `scripts/smoke.ts`, `docs/` |
| 5. Accounts and history | Sign-in, session cookie refresh, saved sessions, delete controls | `lib/supabase/`, `lib/sessions.ts`, `proxy.ts`, `app/auth/`, `app/signin/`, `app/history/`, `app/api/sessions/`, `app/api/account/`, `components/ui/auth.ts`, `components/ui/AuthNav.tsx`, `supabase/migrations/` |

API:

- `GET /api/companions` returns the six companions (no prompt text).
- `POST /api/chat` `{ companionId, selections, messages }` returns a plain-text stream, with an optional first line `MOOD:<mood>`.
- `POST /api/notes` `{ companionId, selections, messages, durationMs }` returns a `NotesResult`; 404 for Friend.

Signed-in users only (401 when signed out, 503 when Supabase is not configured):

- `POST /api/sessions` `{ id, companionId, selections, messages, durationMs, notes? }` saves a session. `id` is a UUID made in the browser, so saving again updates the same row. 409 when the account already holds 200 sessions.
- `GET /api/sessions?cursor=` returns `{ sessions: SavedSessionSummary[], nextCursor }`, newest first, 20 per page, without transcripts.
- `GET /api/sessions/[id]` returns a `SavedSession`; `DELETE /api/sessions/[id]` removes it. Both answer 404 for an id that is missing or belongs to someone else.
- `DELETE /api/account/data` removes all of the user's saved sessions.
- `GET /auth/callback` finishes the magic-link sign-in; `POST /auth/signout` signs out.

## Accounts and history (optional)

Guests need no account and nothing about their experience changes. Signing in (email magic link, no password) adds one thing: when the notes for a session arrive, the transcript and notes are saved to the account, and `/history` lists them, opens them again in the notes view, and deletes them one by one or all at once.

How it is kept safe:

- The app talks to Supabase with the public anon key plus the signed-in user's own session cookie. There is no service-role key anywhere, so Postgres row-level security is the real boundary: a user can only read, write and delete rows where `user_id` is their own id.
- The API checks the user again on the server (signature-verified token, not the raw cookie), validates and size-limits every request before any database call, and never logs transcript content.
- Saving is best effort. If Supabase is slow or paused, the results page still works and shows "Couldn't save to your history".

### Supabase setup

1. Create a free project at https://supabase.com/dashboard. Free projects pause after about a week without activity: open the dashboard and press **Restore** if history stops working.
2. **SQL Editor** -> New query -> paste the whole of `supabase/migrations/0001_sessions.sql` -> Run. It is safe to run twice. Then check **Table Editor** -> `sessions`: it should say row-level security is enabled, with four policies.
3. **Authentication** -> **Sign In / Providers** -> **Email**: make sure the Email provider is enabled. Passwords are not used; the app only calls the magic-link sign-in.
4. **Authentication** -> **URL Configuration**:
   - **Site URL**: `http://localhost:3000` while developing; change it to your Vercel URL (for example `https://your-app.vercel.app`) when you deploy.
   - **Redirect URLs**: add `http://localhost:3000/auth/callback` and `https://your-app.vercel.app/auth/callback`. If you want sign-in to work on Vercel preview deployments too, also add `https://*-your-team.vercel.app/auth/callback`.
5. **Project Settings** -> **API** (or the **Connect** button): copy the Project URL into `NEXT_PUBLIC_SUPABASE_URL` and the `anon` (or "publishable") key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`, in `.env.local` and in Vercel. Never copy the `service_role` or secret key.
6. Restart `npm run dev` (or redeploy: `NEXT_PUBLIC_*` values are baked in at build time). A "Sign in" link appears in the header.

Things to know:

- The built-in Supabase email service is for testing: it sends only a few emails per hour. Before real users sign up, add your own SMTP provider under **Authentication** -> **Emails** -> **SMTP Settings**.
- The sign-in link must be opened in the same browser that asked for it (the default "PKCE" flow keeps a one-time secret in that browser). To allow other devices, change the Magic Link email template so its link is `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`; the callback route already accepts that form.
- Each account can hold 200 saved sessions (`MAX_SAVED_SESSIONS` in `lib/guard.ts`); after that, saving answers with a message asking the user to delete older ones.

### Upstash setup (durable rate limits)

1. Create a free Redis database at https://console.upstash.com (any region near your Vercel region).
2. From the database page, **REST API** box, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into `.env.local` and into Vercel.

With both set, rate limits are a sliding window stored in Redis, shared by every server instance and unaffected by restarts, counted per signed-in user or per IP for guests. If Upstash is unreachable or slow (over 1.5 seconds), the app falls back to the in-memory limiter for that request and logs one warning: a limiter outage never locks users out.

## Browser support

Voice input uses the Web Speech API, which works in **Chrome on desktop and Android**. In other browsers, or when the microphone is denied, you type instead; everything else works the same. The optional HD voice (Kokoro, runs in the browser) is fastest with WebGPU and falls back to the browser's built-in voice.

## Privacy

**Guests** (not signed in): nothing is stored on the server. A session lives in the browser tab and disappears when the tab closes; the results page has a download button for the transcript and notes.

**Signed-in users**: when the notes for a session arrive, the transcript, setup choices and notes are saved to the user's account in Supabase so they can be reopened from the History page. Only that user can read them. They can delete any session, or everything at once ("Delete all my data"), from the History page. Sessions with the Friend companion have no notes and are not saved.

Audio is never stored or sent to our server for anyone. Server logs never contain transcript text.

The setup page shows this to everyone:

> Your voice is processed by your browser's speech service. Text is sent to AI providers and may be used by them under their terms.

and adds this for signed-in users:

> Your transcripts and notes are saved to your account. You can delete them any time.

## Free-tier request budget

The app is built to run on free provider tiers, and those limits are small, disputed and unverified: Gemini Flash is reported at anywhere from about 20 to about 1,500 requests per day (about 250 is cited most often), and the NVIDIA NIM trial tier at about 40 requests per minute. A session of about 20 turns uses about 21 to 22 model requests (one per turn, one opening line, one for the notes). When a provider is rate limited the app falls back to the next one. To raise the budget, enable billing on a provider or change `LLM_PROVIDER_ORDER` and the `*_MODEL` variables; no code change is needed.

## Extending

- **Add or change a companion, personality or option**: edit the data in `lib/companions.ts`. If it gives notes, add its rubric in `lib/rubrics.ts`.
- **Add a voice**: add an entry to the registry in `lib/voices.ts` and reference its id from a companion.
- **Replace a character's art**: see `components/characters/README.md`. A skin is one SVG component with named anchor points; the rig needs no changes.
- **Change what the notes assess**: edit `lib/rubrics.ts` (data only).

## Deploying to Vercel

1. Import the repository into Vercel.
2. Set the environment variables from `.env.example`: at least one provider key, plus the two Upstash values and (for accounts) the two Supabase values. Provider and Upstash keys are read on the server only; the two `NEXT_PUBLIC_SUPABASE_*` values are public by design.
3. In Supabase, set the Site URL to the Vercel URL and add `https://your-app.vercel.app/auth/callback` to the Redirect URLs (see [Supabase setup](#supabase-setup)).
4. Deploy, then run `BASE_URL=https://your-app.vercel.app npm run smoke`.

Caveat: without the Upstash values the rate limiter in `lib/guard.ts` is in memory. It resets on a cold start and each server instance counts separately, so limits are looser than configured on Vercel. Set the Upstash values before relying on it under real traffic.

## Environment variables

| Variable | Needed | What it is |
|---|---|---|
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `BYTEZ_API_KEY` | at least one | Provider keys. Providers without a key are skipped. |
| `*_MODEL`, `LLM_PROVIDER_ORDER` | no | Override a provider's model, or the order providers are tried in. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | for production | Durable rate limits. Missing: in-memory limiter. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for accounts | Sign-in and saved history. Missing: guests only, no sign-in link. |
| `LIMIT_*` | no | Rate limits and size caps, see `.env.example`. |

## Docs

- [Glossary](docs/GLOSSARY.md)
- [Architecture decision records](docs/adr/): [LLM providers](docs/adr/001-llm-providers.md), [voice input](docs/adr/002-voice-input.md), [voice output](docs/adr/003-voice-output.md), [feedback model](docs/adr/004-feedback-model.md), [data and privacy](docs/adr/005-data-and-privacy.md), [safety](docs/adr/006-safety.md), [hosting and rate limiting](docs/adr/007-hosting-and-rate-limiting.md), [avatar rig and skins](docs/adr/008-avatar-rig-and-skins.md), [accounts and history](docs/adr/009-accounts-and-history.md), [durable rate limits](docs/adr/010-durable-rate-limits.md), [additional free providers](docs/adr/011-additional-free-providers.md), [prompt and rubric sources](docs/adr/012-prompt-and-rubric-sources.md)
