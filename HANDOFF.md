# SetList — Session Handoff (as of 2026-07-22 evening Pacific / ≈2026-07-23 00:00 UTC — Phase 2 shipped & live)

> Note on timing: the working environment's clock is unreliable, so this handoff is anchored to the date and the latest commit (`fd8dc6d`) rather than a precise wall-clock time. The git log is ground truth.

## What SetList is
SetList is a workout-extraction app: paste a YouTube / Instagram / TikTok link (or upload a video) and it extracts a structured, followable workout — every exercise identified, tagged by type, timestamped to where it happens in the source video, and attributed to the creator who made it. Users can then run the workout with a timer, log sets, track history/streaks, and build custom workouts from an exercise library. **As of this session, accounts (Google or email magic-link) sync everything to Supabase across devices.** React 19 + Vite frontend (the whole app is one big `src/App.jsx`), a hybrid AI extraction backend on Vercel serverless functions (`api/`), and — new this session — Supabase (Postgres + Auth) for per-user persistence. Full architecture and conventions live in `CLAUDE.md` at the repo root — read that first.

## Current state — verified
- **App code**: fully committed, pushed, and deployed. `git status` is clean except for **doc-only** changes from this handoff (`CLAUDE.md` update + this `HANDOFF.md` + refreshed memory files) — offered for commit at the end of the session.
- **HEAD = origin/main = `fd8dc6d`** — "Add Phase 2: Supabase accounts + durable per-user persistence".
- **Deploy**: live at **https://setlist-ten-tau.vercel.app**, **confirmed working in production this session** — Claude verified the app serves the new auth-gated build, and Greg signed in with Google and imported his real pre-account workouts on the live site.
- **Recent commits**:
  - `fd8dc6d` Add Phase 2: Supabase accounts + durable per-user persistence
  - `c9af6ce` Add /handoff skill and generate the first HANDOFF.md
  - `0bdf556` Document the hooks-inside-plain-function-screens landmine in CLAUDE.md
  - `f8f1f37` Fix crash-to-blank-screen when finishing onboarding, analysis, or a workout
  - `5499da9` Fix three bugs found testing an Instagram video upload

## Where we are on the roadmap
- **Phase 1.5 (Design Sprint) — CLOSED** (Jul 21).
- **Phase 2 (Supabase: accounts + durable persistence) — SHIPPED & LIVE** (this session, Jul 22). This was the **gate for Beta**: users no longer lose everything on reinstall. Claude Code built it directly (no freelancer).
- **Beta is the next gate**, now cleared to pursue. The **"SetList Action Ratio"** quick win (saved-vs-done retention metric, borrowed from competitor FeedLift) is still queued and undecided — Greg chose Phase 2 first; it can now be computed from the Supabase data.
- Live roadmap doc (Drive): **"SetList Roadmap — CURRENT (as of Jul 22, 2026)"** — https://docs.google.com/document/d/1M5e4-czDsYQ0seFPWxEY4BGoXwEu5B3XAJqLfJ8fcM8/edit (several older "CURRENT" docs still sit in the same folder — no delete capability from the tools — so confirm this dated one is latest before trusting it).

## What shipped this session
**Phase 2 — Supabase accounts + durable per-user persistence, end-to-end and live.** Details:
- **Schema** (`supabase/migrations/0001_init.sql`): `profiles`, `workouts`, `sessions`, `own_exercises`; owner-only RLS (`user_id = auth.uid()`); a profile-on-signup trigger; `updated_at` triggers. **Hybrid design** — top-level fields are real columns, but the two exercise arrays stay **JSONB** (`workouts.exercise_list`, `sessions.exercises`) so App.jsx's shapes barely changed. `sessions.workout_id` is nullable + `ON DELETE SET NULL` with a title/exercises snapshot, so **history survives workout deletion** (preserves the old behavior).
- **Client + data layer**: `src/lib/supabase.js` (client) and `src/lib/db.js` (row⇄app-shape mappers + CRUD + the import routine).
- **Auth**: Google OAuth + email magic-link, both linking to one account per email. Whole app gated behind a sign-in `AuthScreen`; `session`/`authReady` + `AuthScreen` form state live at `App`'s top level (per the plain-function-screen hooks rule).
- **One-time localStorage → account import**: when a user with pre-account data first signs in, their old `sl_workouts`/`sl_history` are upserted into Supabase (UUIDs minted, old `Date.now()` workout ids remapped to the new session FKs), then `profiles.migrated_local_at` is stamped so it never re-runs. **Verified on Greg's real production data.**
- **`own_exercises` is now durable** (was ephemeral React state that vanished on refresh). Sign-out added to the Progress screen.
- **Verification**: full loop proven against the live DB — locally via an anonymous session (import + FK remap + JSONB fidelity + reload persistence + live insert + delete-preserves-history + RLS), then Greg's real Google sign-in + real data import on production. Clean production build confirmed before deploy.
- **Docs**: `docs/phase-2-supabase.md` (design + field maps + verification log); `CLAUDE.md` Persistence section rewritten.

## What's next (the actual next actionable thing)
The core is done and live. Remaining work is **deferred polish, none of it blocking** — the "make it perfect later" list:
1. **Publish the Google OAuth app** — the highest-priority near-term item. It's still in "testing" mode, so **only added test users can use the Google button**. Publish before inviting beta testers (Google Auth Platform → Audience → Publish; no verification review needed for the basic email/profile scopes). Magic-link already works for anyone.
2. **Brand the auth emails** — they currently send from the default "Supabase Auth" template.
3. **Per-user offline read cache** — so the library loads with no signal (e.g. at the gym). Deferred by design.
4. **Resume an in-progress workout** after a refresh. Deferred by design.
5. **Undecided/queued**: the "SetList Action Ratio" metric (fast retention win, now computable from Supabase data).
6. Pre-existing tech debt (from CLAUDE.md): durable rate limiting (Vercel KV / Upstash) before real usage volume.

## Key decisions & why
- **Hybrid schema (JSONB exercise arrays), not full normalization** — chosen to keep the migration faithful and App.jsx changes minimal; normalize exercises into real rows *later*, only when the creator/type-browsing differentiator needs SQL. (Greg picked this over full-normalize.)
- **Google + magic-link auth** (not email/password) — low friction, no password management; add Sign in with Apple at Phase 4 for the App Store.
- **Supabase = source of truth**, localStorage demoted to legacy/import-source (offline cache deferred).
- **Phase 2 built branch-first, merged to deploy** — `main` was kept deployable until the Vercel env vars existed, because every push to `main` auto-deploys and shipping the auth gate without Supabase creds would have gated the live app behind a broken sign-in. Env vars added first, then merged.
- **Anonymous sign-ins** were toggled ON only to let Claude drive an anon session for verification, then **turned back OFF** (verified off).

## Gotchas / landmines
- **Nested screen closures must NOT declare their own hooks.** Screens like `AuthScreen`/`ImportScreen`/`ReviewScreen`/`OnboardingScreen` are called as plain functions (`XScreen()`, not `<XScreen/>`) to avoid a focus-loss remount bug — but that means any `useState`/`useEffect` inside them corrupts `App`'s hook order and crashes the whole app (no error boundary exists). Any state a screen needs goes at `App`'s top level. Spelled out in CLAUDE.md's Conventions — **read that before adding/refactoring any screen.**
- **Supabase auth config isn't readable via the anon API** — the redirect-URL allowlist and provider secrets can't be fetched. Verify *functionally*: probe `GET /auth/v1/settings` (→ `external.google`/`external.email`), and test `supabase.auth.signInAnonymously()` to check the anon toggle. A dev-only `window.__sb` client handle is exposed on `localhost` (stripped from prod) for console testing.
- **Magic-link / OAuth must complete in the same browser that started it, on a host where the redirect URL resolves.** `localhost:5173` only exists on the dev machine — clicking a magic link on a phone or a different browser lands on a blank/black page. (This bit us during testing.)
- **`/api/*` routes don't run on the Vite dev server** — backend-touching changes need the deployed app. **Supabase is the exception** (client-side), so auth + persistence *are* testable on `npm run dev`.
- **`BLOB_READ_WRITE_TOKEN` is "Sensitive" in Vercel** — unretrievable once set; test Blob code against prod.
- **Use `setlist-ten-tau.vercel.app`** for testing — the default `…greghunt107-3649s-projects.vercel.app` domain has Deployment Protection and 401s scripted requests.
- **Verify, don't assert.** Greg expects claims backed by real tests (production calls, browser checks, DB queries), and plain correction when something's wrong.

## Pointers
- **Repo**: `C:\Users\ghunt\setlist`  ·  **Prod**: https://setlist-ten-tau.vercel.app
- **Supabase**: project ref `bpojvolgrgfbqydanvsg` · dashboard https://supabase.com/dashboard/project/bpojvolgrgfbqydanvsg · design/verification notes in `docs/phase-2-supabase.md`
- **Roadmap (Drive)**: "SetList Roadmap — CURRENT (as of Jul 22, 2026)" — https://docs.google.com/document/d/1M5e4-czDsYQ0seFPWxEY4BGoXwEu5B3XAJqLfJ8fcM8/edit
- **Architecture & conventions**: `CLAUDE.md` (repo root) — the single most important file to read first
- **Brand kit**: `brand-kit/` (`BRAND.md` is canonical for palette/type/voice/logo)
- **Memory (auto-loads in a new Claude Code session in this folder)**: `C:\Users\ghunt\.claude\projects\C--Users-ghunt-setlist\memory\`

## How to resume
- **New Claude Code session in this folder** (`C:\Users\ghunt\setlist`): the memory files and `CLAUDE.md` auto-load — just open a session and say "where were we." `/handoff` regenerates this doc anytime.
- **Any other tool** (claude.ai web, mobile, a different machine): paste this entire file as your first message. It stands on its own.
