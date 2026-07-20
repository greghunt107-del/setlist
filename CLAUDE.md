# SetList

A workout extraction app: paste a YouTube / Instagram / TikTok link and SetList extracts a structured, followable workout (exercises, sets/reps, video timestamps) using AI. Users can then run the workout with a timer, log sets, track history/streaks, and build custom workouts from an exercise library.

## Architecture

- **Frontend**: React 19 + Vite. The entire app lives in `src/App.jsx` (~1,100 lines) — one `App` component with tab-based navigation (home / import / library / progress), plus a few small components (`ExerciseVideoDrawer`, `VideoOverlay`) and the `useExerciseVideo` hook. `src/main.jsx` is just the mount point.
- **Backend**: Vercel serverless function at `api/analyze.js`. The frontend POSTs `{url, caption}` to `/api/analyze`. The function detects the platform, pulls YouTube metadata/chapters/timed captions (via `YOUTUBE_API_KEY`), builds a prompt, and calls the Claude API (`claude-sonnet-4-5`, key in `VITE_ANTHROPIC_API_KEY` env var) to extract a workout JSON. It then post-processes timestamps through a 4-tier confidence system: chapters (fuzzy-matched) → timed transcript → start-of-video fallback → generic demo.
- **Persistence**: browser localStorage only, no database. Keys:
  - `sl_workouts` — saved workout list (JSON array)
  - `sl_history` — completed workout log (JSON array)
  - `sl_onboarded` — `"1"` once onboarding is done
- **Exercise demo videos**: `useExerciseVideo` searches YouTube (client-side `VITE_YOUTUBE_API_KEY`) with hardcoded `YT_FALLBACKS` video IDs when no key is set.
- **Deploy**: Vercel, auto-deploys on every push to `main` on GitHub (`greghunt107-del/setlist`). Deployment Protection is on, so vercel.app URLs need a Vercel login.

## Conventions

- **All styling lives in the `STYLES` template-string constant** at the top of `src/App.jsx`, with colors from the `C` palette object above it. Do not add CSS files or inline-style sprawl; change `C` for colors, `STYLES` for rules. (`src/index.css` and `src/App.css` are leftover Vite boilerplate — `App.css` isn't even imported.)
- **Light theme**: white background, near-black text, blue reserved for the logo, links, and one solid primary CTA per screen; secondary active states use blue outline + faint blue tint, not solid fills.
- **Small incremental changes, testing between each.** Make one focused change, verify it in the browser preview (dev server via `npm run dev`, launch config in `.claude/launch.json`), then move to the next. Don't batch big rewrites.
- Commit and push to `main` only when the user is happy with a verified state — every push goes live.

## Planned: hybrid extraction pipeline

The next evolution of `/api/analyze`:

1. **Two extractors run in parallel**:
   - **Gemini video-native**: send the actual video to Gemini for direct visual analysis.
   - **Existing text pipeline**: chapters + timed transcript + caption → Claude (what `api/analyze.js` does today).
2. **Claude API as the merge layer**: takes both extractor outputs and reconciles them into one final workout, resolving disagreements about exercise names, order, and timestamps.

### Data model rule

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
