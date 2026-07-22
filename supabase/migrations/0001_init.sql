-- SetList — Phase 2 initial schema
-- Accounts + durable per-user persistence (replaces localStorage-only storage).
--
-- Architecture (decided 2026-07-22):
--   * HYBRID normalization: top-level entities are real rows with RLS; the two
--     exercise arrays (a workout's planned exercises, a session's performed sets)
--     stay as JSONB so the migration is a near-faithful copy of today's shapes and
--     App.jsx barely changes. Normalize exercises into their own table LATER, when
--     the creator/type-browsing differentiator actually needs SQL queries.
--   * Supabase Auth (Google + email magic-link). Every table is owner-scoped via RLS.
--   * Supabase is the source of truth; localStorage is demoted to an offline read cache.
--
-- Safely re-runnable (idempotent) and NON-destructive to data: tables use
-- "if not exists" and policies are dropped-then-created. Run in the Supabase SQL
-- editor OR via `supabase db push`. gen_random_uuid() is built in — no extension.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Auto-maintain updated_at on row updates.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users. Replaces the sl_onboarded flag.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text,
  display_name      text,
  onboarded         boolean     not null default false,  -- was localStorage "sl_onboarded"
  migrated_local_at timestamptz,                          -- set once the one-time localStorage import runs
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Seed a profile row automatically whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- workouts — was localStorage "sl_workouts". exercise_list stays JSONB.
-- ---------------------------------------------------------------------------
create table if not exists public.workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  title         text        not null,
  tag           text,
  emoji         text,
  source        text,        -- platform: YouTube / TikTok / Instagram / Custom
  duration_min  integer,     -- app field: duration
  level         text,
  influencer    text,        -- creator @handle, or "You" for custom
  is_own        boolean     not null default false,
  video_id      text,        -- source YouTube id (app's videoId === youtubeId today)
  thumbnail_url text,
  notes         text,        -- coach notes
  exercise_list jsonb       not null default '[]'::jsonb,  -- the exerciseList array, unchanged
  legacy_id     bigint,      -- old client Date.now() id; lets migration remap session links
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists workouts_user_created_idx
  on public.workouts (user_id, created_at desc);

-- Idempotent re-import: a user can't get two copies of the same legacy workout.
create unique index if not exists workouts_user_legacy_uidx
  on public.workouts (user_id, legacy_id)
  where legacy_id is not null;

drop trigger if exists workouts_set_updated_at on public.workouts;
create trigger workouts_set_updated_at
  before update on public.workouts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions — was localStorage "sl_history" (completed-workout log).
-- Denormalized on purpose: a session must SURVIVE deletion of its workout,
-- exactly like today. So workout_id is nullable + ON DELETE SET NULL, and the
-- title / performed exercises are snapshotted onto the row.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  workout_id    uuid        references public.workouts (id) on delete set null,
  workout_title text        not null,                       -- snapshot; app field workoutTitle
  performed_at  timestamptz not null,                       -- app field: date
  duration_sec  integer     not null,                       -- app field: duration (seconds)
  total_volume  integer,                                    -- app field: totalVolume
  exercises     jsonb       not null default '[]'::jsonb,   -- performed snapshot incl. sets[]
  legacy_id     bigint,
  created_at    timestamptz not null default now()
);

create index if not exists sessions_user_performed_idx
  on public.sessions (user_id, performed_at desc);

create unique index if not exists sessions_user_legacy_uidx
  on public.sessions (user_id, legacy_id)
  where legacy_id is not null;

-- ---------------------------------------------------------------------------
-- own_exercises — the custom exercise library. NEW durable home for what is
-- currently ephemeral React state (ownExercises), so it stops vanishing on refresh.
-- ---------------------------------------------------------------------------
create table if not exists public.own_exercises (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  name           text        not null,
  muscle_group   text,
  default_sets   text,
  default_reps   text,
  default_weight text,
  notes          text,
  video_url      text,
  created_at     timestamptz not null default now()
);

create index if not exists own_exercises_user_idx
  on public.own_exercises (user_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security — owner-only on every table. Policies are dropped-then-created
-- so this whole file can be re-run safely (CREATE POLICY has no IF NOT EXISTS).
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.workouts      enable row level security;
alter table public.sessions      enable row level security;
alter table public.own_exercises enable row level security;

-- profiles: a user sees and edits only their own row (insert is done by the
-- security-definer signup trigger, so no insert policy is needed).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- workouts / sessions / own_exercises: full owner-only CRUD.
drop policy if exists "workouts_select_own" on public.workouts;
create policy "workouts_select_own" on public.workouts
  for select using ((select auth.uid()) = user_id);
drop policy if exists "workouts_insert_own" on public.workouts;
create policy "workouts_insert_own" on public.workouts
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "workouts_update_own" on public.workouts;
create policy "workouts_update_own" on public.workouts
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "workouts_delete_own" on public.workouts;
create policy "workouts_delete_own" on public.workouts
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own" on public.sessions
  for select using ((select auth.uid()) = user_id);
drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own" on public.sessions
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own" on public.sessions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_delete_own" on public.sessions
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "own_exercises_select_own" on public.own_exercises;
create policy "own_exercises_select_own" on public.own_exercises
  for select using ((select auth.uid()) = user_id);
drop policy if exists "own_exercises_insert_own" on public.own_exercises;
create policy "own_exercises_insert_own" on public.own_exercises
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "own_exercises_update_own" on public.own_exercises;
create policy "own_exercises_update_own" on public.own_exercises
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own_exercises_delete_own" on public.own_exercises;
create policy "own_exercises_delete_own" on public.own_exercises
  for delete using ((select auth.uid()) = user_id);
