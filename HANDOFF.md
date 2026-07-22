# SetList — Session Handoff (as of 2026-07-22, end of session — right after the blank-screen crash fix)

> Note on timing: the working environment's clock is unreliable (it disagreed with real Pacific time this session), so this handoff is anchored to the date and the latest commit rather than a precise wall-clock time. The git log is the ground truth for how far we got.

## What SetList is
SetList is a workout-extraction app: paste a YouTube / Instagram / TikTok link (or upload a video) and it extracts a structured, followable workout — every exercise identified, tagged by type, timestamped to where it happens in the source video, and attributed to the creator who made it. Users can then run the workout with a timer, log sets, track history/streaks, and build custom workouts from an exercise library. React 19 + Vite frontend (the whole app is one big `src/App.jsx`), a hybrid AI extraction backend on Vercel serverless functions (`api/`), and localStorage-only persistence (no database yet — that's Phase 2). Full architecture and conventions live in `CLAUDE.md` at the repo root — read that first.

## Current state — verified
- **Git**: working tree clean; local `main` matches `origin/main` (everything pushed).
- **HEAD**: `0bdf556` — "Document the hooks-inside-plain-function-screens landmine in CLAUDE.md"
- **Deploy**: live at **https://setlist-ten-tau.vercel.app** (Vercel auto-deploys every push to `main`; last deploy confirmed green this session).
- **Recent commits**:
  - `0bdf556` Document the hooks-inside-plain-function-screens landmine in CLAUDE.md
  - `f8f1f37` Fix crash-to-blank-screen when finishing onboarding, analysis, or a workout
  - `3af874a` Bring CLAUDE.md up to date with what's actually shipped
  - `5499da9` Fix three bugs found testing an Instagram video upload
  - `bac462f` Finish the tracker (active workout screen) design-sprint pass

## Where we are on the roadmap
- **Phase 1.5 (Design Sprint) is CLOSED.** Big Shoulders Display rebrand, full brand kit in `brand-kit/`, new "SL" monogram app icon, and the Import / Home / Library / Tracker screens all redesigned.
- **Phase 2 (Database + Accounts, Supabase) is NEXT and has NOT been started.** Auth, migrate off localStorage (`sl_workouts`/`sl_history`), per-user stats, progress charts, profile screen. Decision made: **Claude Code builds this directly — no freelancer** (the roadmap originally said "freelancer-led"; Greg changed that because he's not sure how he'd manage a freelancer and trusts the direct build given the backend work already shipped this session).
- Live roadmap doc (Google Drive): **"SetList Roadmap — CURRENT (as of Jul 22, 2026)"** — https://docs.google.com/document/d/1M5e4-czDsYQ0seFPWxEY4BGoXwEu5B3XAJqLfJ8fcM8/edit . (Note: several older "CURRENT" roadmap docs still sit in the same Drive folder because there's no delete capability from the tools — this dated one supersedes them all.)

## What shipped this session
- **Full design-sprint rebrand**: swapped display face from Syne to Big Shoulders Display (Syne read "cartoony" at heavy weight); produced and committed a brand kit (`brand-kit/BRAND.md`, `logo.svg`, `tokens.css`, `colors.json`, `app-icon/`); shipped a new two-tone "SL" monogram app icon replacing a stale purple-gradient placeholder.
- **Screen redesigns**: Import (hero paste field + platform-detection pills + real analyzing-stage list), Home (byline creator attribution), Library (grid/list/grouped + builder), Tracker copy/polish. Plus onboarding fixes.
- **Three upload bugs fixed** (`5499da9`): uploaded videos now get a client-captured thumbnail; exercise demos play the actual uploaded clip via a new `api/video-proxy.js` (streams private Blob video with Range support) instead of a generic YouTube search; and the creator-handle input no longer lost focus every keystroke.
- **Critical crash fix** (`f8f1f37`): finishing onboarding, landing on the review screen after an analysis, or finishing a workout could crash the whole app to a blank screen. Root cause: three nested "screen" closures (`OnboardingScreen`, `ReviewScreen`, `CompletionScreen`) declared their own React hooks while being called as plain functions — a Rules-of-Hooks violation with no error boundary to catch it. Fixed by lifting their state to `App`'s top level. This is the "analyzer times out, screen goes black" symptom Greg reported. **Now documented as a permanent landmine in CLAUDE.md.**
- **Competitive-intel roadmap update**: see next section.

## What's next (the actual next actionable thing)
1. **Phase 2 — Supabase (accounts + real persistence).** This is the clear next build and the gate for Beta (localStorage means users lose everything on reinstall). Claude Code builds it directly. Reasonable starting point: schema + auth flow + a migration plan from the current localStorage keys.
2. **Undecided / queued:** a **"SetList Action Ratio"** metric (saved-vs-done, a retention hook borrowed from competitor FeedLift) — computable *today* from existing localStorage data with no backend, so it's a cheap quick win. Open question Greg was weighing: build this first as a fast standalone win, or go straight into Phase 2. Not decided.
3. **Instagram friction (recurring concern):** Instagram import works today only via manual caption-paste or file upload — there is no automatic paste-and-go, and won't be until Phase 4's native Share Extension. An **Android-only PWA Share Target** was floated as a faster partial fix (Android only; iOS can't do this for PWAs). Greg said "not yet." Worth resurfacing if Instagram friction comes up again — it's one of his most important channels and a stated anxiety.

## Key decisions & why
- **Instagram auto-fetch is ruled out, deliberately.** Meta's oEmbed returns no caption/author data even with App Review (live-tested). No scraping dependency either — it's a ToS-violating, revocable foundation risk. The durable fix is a native Share Extension at Phase 4. Don't reopen this without new information.
- **Extraction alone is no longer the differentiator.** 10+ competitors already do "link → structured workout" (FitSaver, FeedLift, RepReel, Stashd, Repperoo, Reelief, Gymdex, Gymnify, SetSaver). FeedLift is most advanced (habit/identity layer: muscle heatmap, Action Ratio, AI programs, Apple Health sync, XP/streaks). **SetList's structural edge is that every exercise is mandatorily tagged with creator handle + platform** — lean into creator/type browsing, not a head-on habit-tracker arms race. Roadmap now gates the App Store launch (Phase 4) on shipping a real differentiator first (no bare-wrapper launch), and adds a milestone to benchmark extraction accuracy vs FeedLift before claiming "more accurate" in marketing.
- **Phase 2 is Claude-built, not freelancer-led** (see roadmap section above).

## Gotchas / landmines
- **Nested screen closures must NOT declare their own hooks.** Screens like `ImportScreen`/`ReviewScreen`/`OnboardingScreen`/`CompletionScreen` are called as plain functions (`XScreen()`, not `<XScreen/>`) to avoid a focus-loss remount bug — but that means any `useState`/`useEffect` inside them corrupts `App`'s hook order and crashes the entire app (no error boundary exists). Any state a screen needs goes at `App`'s top level. This bug shipped twice; it's now spelled out in CLAUDE.md's Conventions. **Read that section before adding or refactoring any screen.**
- **`/api/*` routes don't run on the Vite dev server.** Anything backend-touching must be verified against the deployed app (production), not localhost.
- **`BLOB_READ_WRITE_TOKEN` is "Sensitive" in Vercel** — unretrievable in plaintext once set. Test Blob-touching code against production, not local `.env`.
- **Use the `setlist-ten-tau.vercel.app` domain for testing** — the default `...greghunt107-3649s-projects.vercel.app` domain has SSO/Deployment Protection and 401s scripted requests.
- **Google Drive: no delete capability** from the available tools — every roadmap update creates a new doc; Greg trashes old ones manually. Always confirm which dated "CURRENT" doc is latest before trusting one.
- **Verify, don't assert.** Greg expects claims backed by real tests (production calls, browser checks, byte comparisons), not "should work" reasoning — and plain correction when something's wrong.

## Pointers
- **Repo**: `C:\Users\ghunt\setlist`  ·  **Prod**: https://setlist-ten-tau.vercel.app
- **Roadmap (Drive)**: "SetList Roadmap — CURRENT (as of Jul 22, 2026)" — https://docs.google.com/document/d/1M5e4-czDsYQ0seFPWxEY4BGoXwEu5B3XAJqLfJ8fcM8/edit
- **Architecture & conventions**: `CLAUDE.md` (repo root) — the single most important file to read first
- **Brand kit**: `brand-kit/` (`BRAND.md` is canonical for palette/type/voice/logo)
- **Memory (auto-loads in a new Claude Code session in this folder)**: `C:\Users\ghunt\.claude\projects\C--Users-ghunt-setlist\memory\`

## How to resume
- **New Claude Code session in this folder** (`C:\Users\ghunt\setlist`): the memory files and `CLAUDE.md` auto-load — just open a session and say "where were we." The `/handoff` command is also available here to regenerate this doc anytime.
- **Any other tool** (claude.ai web, mobile, a different machine): paste this entire file as your first message. It stands on its own.
