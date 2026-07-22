# SetList

A workout extraction app: paste a YouTube / Instagram / TikTok link (or upload a video) and SetList extracts a structured, followable workout (exercises, sets/reps, video timestamps) using AI. Users can then run the workout with a timer, log sets, track history/streaks, and build custom workouts from an exercise library.

## Architecture

- **Frontend**: React 19 + Vite. The entire app lives in `src/App.jsx` (~1,300 lines) — one `App` component with tab-based navigation (home / import / library / progress), plus a few small components (`ExerciseVideoDrawer`, `VideoOverlay`) and the `useExerciseVideo` hook. `src/main.jsx` is just the mount point.
- **Backend — hybrid extraction pipeline** at `api/analyze.js`. The frontend POSTs either `{url, caption}` (link import) or `{blobUrl, caption, creatorHandle}` (file upload) to `/api/analyze`.
  - **Link import** runs two extractors in parallel, reconciled by a Claude merge layer:
    - *Gemini video-native* (YouTube only): sends the video directly to Gemini (`gemini-3.5-flash`, falling back to `gemini-3.1-flash-lite` on overload) for visual analysis.
    - *Text pipeline*: YouTube chapters/timed transcript, or TikTok's public oEmbed (caption/creator/thumbnail, no auth needed) → Claude (`claude-sonnet-5`, structured JSON output). Timestamps post-process through a 4-tier confidence system: chapters (fuzzy-matched) → timed transcript → start-of-video fallback → generic demo.
    - *Merge layer*: `claude-opus-4-8` reconciles both outputs into one workout; a code-level safety net discards the merge and falls back to the richer single source if the merge model under-keeps exercises.
    - Instagram link-paste is **not** auto-fetched — Meta's oEmbed doesn't return caption/author data even with App Review (confirmed by testing) — so users paste the caption manually or upload the file instead.
  - **File upload** (for private/Instagram clips with no fetchable URL): `api/upload.js` issues a scoped Vercel Blob client-upload token so the browser uploads directly to private Blob storage (bypasses Vercel's ~4.5MB body cap). `api/analyze.js` then fetches the blob server-side, uploads it to the Gemini Files API (resumable upload, polled until ACTIVE), and runs video-native extraction only — no text pipeline or merge, since there's nothing to merge against. Creator handle is supplied manually since uploads carry no platform metadata.
- **`api/video-proxy.js`**: streams a private Blob-hosted video back to the browser, forwarding Range requests so seeking works. Needed because a bare `<video src>` can't attach the Authorization header a private Blob read requires. Restricted to `*.blob.vercel-storage.com` URLs so it can't be used as an open proxy.
- **Persistence**: browser localStorage only, no database. Keys:
  - `sl_workouts` — saved workout list (JSON array)
  - `sl_history` — completed workout log (JSON array)
  - `sl_onboarded` — `"1"` once onboarding is done
- **Exercise demo videos**, in priority order per exercise: (1) `source_video` — jump to the exercise's timestamp in the original YouTube video; (2) `uploaded_video` — play the user's uploaded clip via `api/video-proxy.js`, seeked to the timestamp; (3) `generic_demo` — `useExerciseVideo` searches YouTube (client-side `VITE_YOUTUBE_API_KEY`) with hardcoded `YT_FALLBACKS` video IDs when no key is set.
- **Rate limiting**: per-IP, in-memory, 10 requests/hour per bucket (`analyze` and `upload` tracked separately — see `checkRateLimit`/`getClientIp` in `api/analyze.js`). In-memory means it resets on cold start and doesn't hold across serverless instances — upgrade to durable storage (Vercel KV / Upstash Redis) before real usage volume.
- **Deploy**: Vercel, auto-deploys on every push to `main` on GitHub (`greghunt107-del/setlist`). Deployment Protection is on, so vercel.app URLs need a Vercel login.

## Conventions

- **All styling lives in the `STYLES` template-string constant** at the top of `src/App.jsx`, with colors from the `C` palette object above it. Do not add CSS files or inline-style sprawl; change `C` for colors, `STYLES` for rules. (`src/index.css` and `src/App.css` are leftover Vite boilerplate — `App.css` isn't even imported.)
- **Brand kit lives in `brand-kit/`** (versioned in the repo) — `BRAND.md` is the canonical reference for palette, typography, voice, and logo usage; `tokens.css`/`colors.json` mirror the `C` palette in reusable form. Check it before making visual design calls.
- **Light theme**: white background, near-black text (`#0A0B0E`, never pure black), blue reserved for the logo, links, and one solid primary CTA per screen; secondary active states use blue outline + faint blue tint, not solid fills. No gradients, no drop shadows.
- **Type system**: Big Shoulders Display (700/800) for headings/CTAs/stat numbers, Manrope (400/500/700) for body copy, DM Mono (500) for timers/counts/timestamps. Don't add a fourth face.
- **Nested screen/modal components must be invoked as plain functions, not JSX.** Every screen (`ImportScreen`, `LibraryScreen`, `ReviewScreen`, `CreateExModal`, etc.) is a closure defined inside `App`'s body, so calling one as `<XScreen/>` gives React a new component "type" every render and remounts the whole subtree — this silently breaks focus in any input inside it after every keystroke. Call them as `XScreen()` instead, matching `renderHome()`/`renderActiveWorkout()`. (`VideoOverlay`/`ExerciseVideoDrawer` are the exception — real top-level components declared outside `App`, so normal `<VideoOverlay/>` JSX is correct for those.)
- **Small incremental changes, testing between each.** Make one focused change, verify it in the browser preview (dev server via `npm run dev`, launch config in `.claude/launch.json`), then move to the next. Don't batch big rewrites. Note: `/api/*` routes don't run on the Vite dev server — anything touching the backend needs testing against the deployed app.
- Commit and push to `main` only when the user is happy with a verified state — every push goes live.

## Data model rule

Every extracted exercise MUST carry these fields:

| Field | Meaning |
|---|---|
| `exercise_name` | Exact exercise name |
| `exercise_type` | One of: `strength`, `cardio`, `core`, `mobility`, `plyometric` |
| `creator_handle` | Creator's @handle |
| `creator_platform` | Platform the workout came from |
| `source_url` | Original video/post URL |
| `timestamp` | Seconds into the source video where the exercise starts |

The five exercise types above are the complete, closed set — don't invent new ones.
