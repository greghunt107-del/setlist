# Phase 2 — Supabase (accounts + durable persistence)

**Goal:** move SetList off localStorage-only storage onto real per-user accounts, so
users stop losing everything on reinstall. This is the gate for Beta.

**Architecture decisions (locked 2026-07-22):**
- **Hybrid schema** — real rows + RLS for `profiles` / `workouts` / `sessions` /
  `own_exercises`; the two exercise arrays stay as **JSONB** (near-faithful copy of
  today's shapes, minimal App.jsx rewrite). Normalize exercises into their own table
  later, when creator/type browsing needs SQL.
- **Auth:** Supabase Auth — Google one-tap + email magic-link fallback. Add Sign in
  with Apple at Phase 4 (App Store requires it once any social login is offered).
- **Source of truth:** Supabase. localStorage demoted to an offline read cache.

The schema lives in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

---

## Operational setup — Greg's to-dos (needs your Supabase account)

These unblock the client build. None of it can be scripted from here — it needs a
logged-in Supabase account and Google Cloud console.

1. **Create the Supabase project** (region close to users). Note the Project URL and
   the **Publishable key** (`sb_publishable_…`) — for new projects this is what used to
   be called the "anon key". It's safe in the browser (RLS is what protects data, and
   the schema already enforces it). The legacy `eyJ…` JWT anon key, if ever needed, is
   under Settings → API → Legacy API keys. **Never** put the Secret key (`sb_secret_…`)
   or the DB connection-string password in client code — those bypass RLS / are server-only.
2. **Run the schema:** paste the contents of `0001_init.sql` into the Dashboard SQL
   editor and run it (or `supabase db push` if you install the CLI later).
3. **Enable auth providers** (Authentication → Providers):
   - **Email** → turn on magic link (passwordless).
   - **Google** → needs a Google Cloud OAuth client (Client ID + secret); paste the
     Supabase callback URL it shows you into the Google console's authorized redirect URIs.
4. **Set redirect URLs** (Authentication → URL Configuration): add
   `http://localhost:5173` (Vite dev) and `https://setlist-ten-tau.vercel.app` so
   magic-link / OAuth redirects land back in the app.
5. **Give me the two values** for `.env.local` and Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (the value is the **Publishable key**, `sb_publishable_…`)

   These also go into Vercel → Project → Settings → Environment Variables for prod.
   (`.env*` is gitignored, so nothing secret is committed.)

**Nice property:** Supabase calls go straight from the browser to Supabase's API — no
Vercel serverless function involved. So unlike the `/api/analyze` pipeline, the entire
auth + persistence layer **is testable on the Vite dev server** (`npm run dev`).

---

## Client build order (Claude-built, one small step at a time)

Each step is verifiable in the browser preview before the next.

1. **Client + env.** `npm i @supabase/supabase-js`; add `src/lib/supabase.js`
   (reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
2. **Data layer.** `src/lib/db.js` with `rowToWorkout`/`workoutToRow`,
   `rowToSession`/`sessionToRow` mappers (see field maps below) and CRUD helpers.
3. **Auth gate + session state.** Session lives at `App`'s top level (per the
   plain-function-screen rule in CLAUDE.md — no hooks inside nested screens). New
   `AuthScreen` (Google button + magic-link email) shown when signed out.
4. **Swap persistence.** Replace the three localStorage `useState` initializers and the
   two write-through `useEffect`s (App.jsx:426–478) with Supabase reads on load +
   write-through on change; keep localStorage as a cache mirror.
5. **One-time migration prompt** (see below).
6. **Persist `ownExercises`** via `own_exercises` (fixes today's refresh-loss bug).
7. *(Deferred)* resumable in-progress `activeWorkout`, and true offline sync.

---

## One-time localStorage → account migration

There is **no server data to migrate** — it all lives in browsers. So migration is a
client-side import that runs the first time an existing user signs in:

1. On sign-in, if `profiles.migrated_local_at` is null **and** localStorage has
   `sl_workouts`/`sl_history`, offer "Import your existing SetList data."
2. On confirm:
   - Insert workouts with `legacy_id` = the old `Date.now()` id; build an
     old-id → new-uuid map from the returned rows.
   - Insert sessions, mapping `workoutId` through that map (null if the workout was
     already deleted — sessions are meant to survive that).
   - Set `profiles.onboarded` from the old `sl_onboarded` flag.
   - Stamp `profiles.migrated_local_at = now()`.
3. Keep the localStorage keys as a backup/cache (don't delete). The unique
   `(user_id, legacy_id)` indexes make a re-run idempotent.

---

## Field maps (app shape ↔ columns)

**workouts** — top-level fields become columns; `exerciseList` stays JSONB verbatim.

| App field | Column |
|---|---|
| `id` | `id` (uuid — was a `Date.now()` number) |
| `title` `tag` `emoji` `source` `level` `influencer` `notes` | same names |
| `duration` | `duration_min` |
| `isOwn` | `is_own` |
| `videoId` / `youtubeId` | `video_id` (both hydrate from it on read) |
| `thumbnailUrl` | `thumbnail_url` |
| `exerciseList` | `exercise_list` (jsonb) |
| — | `legacy_id` (old id, migration only) |

**sessions** — `exercises` snapshot stays JSONB verbatim.

| App field | Column |
|---|---|
| `id` | `id` (uuid) |
| `workoutId` | `workout_id` (uuid, remapped; nullable) |
| `workoutTitle` | `workout_title` |
| `date` | `performed_at` |
| `duration` | `duration_sec` |
| `totalVolume` | `total_volume` |
| `exercises` | `exercises` (jsonb) |

**own_exercises** — `name`, `muscleGroup`→`muscle_group`, `defaultSets`→`default_sets`,
`defaultReps`→`default_reps`, `defaultWeight`→`default_weight`, `notes`, `videoUrl`→`video_url`.

---

## Status

- [x] Current data model audited (App.jsx + api/analyze.js)
- [x] Schema + RLS written (`0001_init.sql`)
- [x] Plan + field maps written (this doc)
- [x] Supabase project created; `VITE_SUPABASE_URL` + publishable key in local `.env.local`
- [x] Client build 1 — `@supabase/supabase-js` installed, `src/lib/supabase.js` client
- [x] Client build 3 — auth gate + session state live in App.jsx; `AuthScreen` renders
      when signed out (verified in the browser; connection to Supabase confirmed 200)
- [x] Schema run in Supabase; all four tables + RLS live (verified 200 on each)
- [x] Client build 2 — `src/lib/db.js` mappers + CRUD
- [x] Client build 4 — persistence (workouts/history/ownExercises) reads/writes Supabase,
      source of truth (verified: survives reload with no localStorage read)
- [x] Client build 5 — one-time localStorage import (verified end-to-end)
- [x] Client build 6 — persist `ownExercises` (verified live insert); sign-out on Progress
- [x] **Full loop verified end-to-end** via an anonymous session (2026-07-22): profile
      auto-created by trigger; onboarding synced from profile; import inserted a workout +
      session with the legacy→uuid FK remapped and JSONB byte-faithful; reload persisted
      from DB; live custom-exercise insert; delete removed the workout while the session
      survived with `workout_id` set null; sign-out re-gated the app.

**Remaining before this goes live:**
- [ ] **Greg — enable Google** (optional; magic-link/email already works): add the Google
      Cloud OAuth client (auth settings currently report `google: false`, `email: true`)
- [ ] **Greg — add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to Vercel** (all envs)
- [ ] **Greg — disable Anonymous sign-ins** again if you don't want that as a real feature
- [ ] Do a real magic-link (and/or Google) sign-in in your own browser
- [ ] Merge `phase-2-supabase` → `main` (that's the deploy) once the above is done
- [ ] Deferred follow-ups: per-user offline read cache; resumable in-progress workout

> **`main` stays deployable** — Phase 2 lives on a branch until the Vercel env vars exist,
> because every push to `main` auto-deploys and shipping the auth gate without Supabase
> creds in prod would put the live app behind a broken sign-in wall.
>
> Dev-only aids in the code: `window.__sb` handle in `src/lib/supabase.js` (stripped from
> prod via `import.meta.env.DEV`). The "Multiple GoTrueClient instances" console warning is
> an HMR artifact (module re-run on hot update) — one client in a real build.
