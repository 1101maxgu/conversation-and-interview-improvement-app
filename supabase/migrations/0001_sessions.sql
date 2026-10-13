-- 0001_sessions.sql: saved practice sessions for signed-in users.
--
-- How to run: Supabase dashboard -> your project -> SQL Editor -> New query -> paste this whole file -> Run.
-- It is safe to run more than once (every statement is "if not exists" or drop-then-create).
-- Afterwards check Table Editor -> sessions: the table should show "RLS enabled" and four policies.
--
-- Security model: the app only ever connects with the public anon key plus the signed-in user's own session, so
-- the row-level security policies below are the real boundary. There is no service-role key in the app.

create table if not exists public.sessions (
  id          uuid primary key,                       -- generated in the browser, so a repeat save updates the same row
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  companion_id text not null check (char_length(companion_id) <= 32),
  selections  jsonb not null,
  messages    jsonb not null,
  duration_ms integer not null check (duration_ms >= 0),
  user_turns  integer not null default 0 check (user_turns >= 0), -- set by the API so the history list never loads transcripts
  notes       jsonb,
  created_at  timestamptz not null default now(),
  -- Size guard. The API already caps a request at 1 MB (lib/guard.ts MAX_BODY_BYTES); this stops anything larger
  -- from reaching the table by another route. A typical session is 5-50 KB, and the API keeps at most 200 per user.
  constraint sessions_size_check check (
    octet_length(messages::text) <= 1000000
    and octet_length(selections::text) <= 100000
    and (notes is null or octet_length(notes::text) <= 200000)
  )
);

create index if not exists sessions_user_created_idx on public.sessions (user_id, created_at desc);

alter table public.sessions enable row level security;

-- Signed-in users can read, add, change and delete their own rows only. Anonymous visitors get nothing.
drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own" on public.sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own" on public.sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own" on public.sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_delete_own" on public.sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Table privileges: row-level security filters rows, these decide who may touch the table at all.
revoke all on public.sessions from anon;
grant select, insert, update, delete on public.sessions to authenticated;
