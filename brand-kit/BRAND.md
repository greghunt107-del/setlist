# SetList — Brand Kit

## What SetList is

SetList is a workout-extraction app: paste a YouTube, Instagram, or TikTok link (or upload a video) and it turns the video into a structured, followable workout — every exercise identified, tagged by type, timestamped to the moment it happens in the source video, and attributed to the creator who made it. Users can then run the workout with a built-in timer, log sets and weight, track history and streaks, and build their own custom workouts from an exercise library that grows as they import more content.

**The core product loop:** paste a link → AI watches/reads the video and extracts the workout → user reviews and saves it → user runs the workout with the timer → progress and history accumulate over time.

## Positioning and audience

SetList sits at the intersection of two existing behaviors: people already save workout videos from fitness creators on social media, and people already use workout-tracking apps. Today those are disconnected — you either watch a saved reel while trying to remember the exercises, or you manually re-type a workout into a tracker. SetList closes that gap.

The long-term vision has three layers:
1. **Extraction Engine** — the AI pipeline that turns any workout video into structured data (this is largely built).
2. **Library + Tracker** — browsing by creator/exercise type, logging sets, tracking progress over time.
3. **Community** — creator profiles, follows, a genuine ecosystem where fitness influencers' content becomes trackable, attributable workouts for their audience.

The influencer/creator angle is central to the vision, not an afterthought — every extracted exercise is permanently tagged with the creator's handle and platform, and attribution is treated as a first-class product requirement, not metadata.

## Brand personality

**Premium, considered, quietly confident.** Not a loud "gym bro" fitness app, not a cutesy consumer toy. The reference points are closer to Whoop, Oura, or Strava's more editorial moments than to typical fitness-app maximalism — restrained color, real typographic hierarchy, and a light, white-ground identity that reads as trustworthy and grown-up rather than hype-driven.

This positioning is deliberate and was arrived at by explicitly rejecting the alternative: an earlier display typeface (Syne) was replaced specifically because its round, wide, single-story letterforms read as playful/craft-fair at heavy weight — "cartoony" was the word used to reject it. Big Shoulders Display was chosen to keep confident, current energy without that toy-like quality.

**Decorative emoji were deliberately removed** from key moments (the workout-completion screen's celebration emoji, the import flow's icon clutter) in favor of plain iconography and typography doing the work — the app should feel like a tool you trust with your training data, not a novelty.

## Logo

`logo.svg` in this folder is the current wordmark: **Set** in near-black, **List** in the brand blue, set in Big Shoulders Display at weight 800, no gap between the two words (matches the in-app header exactly: `Set<em>List</em>`). The font is embedded in the SVG as a base64 `@font-face`, so it renders correctly anywhere without needing the font installed separately.

**App icon:** `app-icon/` holds the current icon set — a two-tone "SL" monogram (ink "S" + blue "L", same Big Shoulders Display 800, same coloring as the wordmark), on a plain white field. Chosen from six directions explored on Jul 21, 2026; this was the most literal extension of the wordmark of the set. Installed in `public/` as `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, and `favicon.svg`.

`app-icons-current-placeholder/` is kept only for reference — it's the old purple-gradient lightning bolt that shipped before this monogram existed. Don't use it for anything; it predates the current brand entirely (wrong color family, uses a gradient the product otherwise avoids).

## Color

Light theme only, and this is a firm brand commitment, not a temporary default — every contrast ratio and CTA weight is tuned for a white ground. See `colors.json` / `tokens.css` for exact values.

- **White background, near-black text** (`#0A0B0E`) — never pure black.
- **Blue is the only accent color** (`#1A5FBF` / `#2A7FEF` bright) — reserved for the logo, links, exactly one primary CTA per screen, and "detected/active" states (e.g. a recognized platform link, an in-progress step). Secondary active states use a blue outline + a faint blue tint wash (`blueGlow`, ~8% alpha blue), never a second solid fill.
- **Green, red, and gold are semantic only** — done/success, destructive actions, and PR/highlight badges respectively. They are never used decoratively or as brand color.
- **No gradients, no drop shadows, no glow effects** anywhere in the product UI.
- Neutrals lean very slightly cool (grays with a faint blue bias), never a flat mid-gray — chosen, not defaulted.

## Typography

Three typefaces, each with one job. This system is deliberate — resist the urge to add a fourth.

| Face | Role | Weights used |
|---|---|---|
| **Big Shoulders Display** | Headings, CTAs, stat numbers, the logo | 700, 800 only |
| **Manrope** | All body copy, descriptions, input fields | 400, 500, 700 |
| **DM Mono** | Timers, set/rep counts, timestamps — anything that reads as a live or precise number | 500 |

All three load from Google Fonts in `index.html`. Sentence case for buttons and labels (not Title Case, not ALL CAPS except small uppercase micro-labels like section headers, which use letter-spacing to read intentionally rather than shouty).

## Shape and spacing

- Card corner radius: 20px. Input/button corner radius: 13px. Pills: fully rounded.
- Borders are always 1–1.5px, hairline-thin, never heavy.
- Generous internal padding, tight component gaps (7–13px) — density comes from spacing discipline, not cramming.

## Voice

Direct, no filler. Buttons are verbs ("Build workout", "Start Workout"), not vague ("Submit", "Continue"). Copy explains what will actually happen rather than hyping it up. Recent copy passes removed exclamation points and decorative emoji from functional UI in favor of plain, confident statements.

## Data model (for context — this shapes a lot of the UI)

Every extracted exercise carries: `exercise_name`, `exercise_type` (one of `strength`, `cardio`, `core`, `mobility`, `plyometric` — a closed set, nothing else), `creator_handle`, `creator_platform`, `source_url`, and `timestamp` (seconds into the source video). This is why creator attribution shows up as a byline on every workout card, not a footnote — it's structurally part of every exercise, not decoration.

## What's in this folder

- `BRAND.md` — this document
- `logo.svg` — the current wordmark, self-contained (font embedded)
- `tokens.css` — the full palette + type system as CSS custom properties
- `colors.json` — the same, as JSON, for tools that want structured data
- `app-icon/` — the current "SL" monogram app icon set (192, 512, apple-touch, favicon)
- `app-icons-current-placeholder/` — the old stale placeholder icons, kept for reference only, not brand-accurate (see App icon section above)
