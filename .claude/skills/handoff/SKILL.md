---
name: handoff
description: Produce a complete session handoff for the SetList project so work can resume cleanly in a fresh chat (this Claude Code project, claude.ai web, mobile, or any other tool). Use whenever Greg says /handoff, "hand off", "wrap up", "save everything before I take a break", "get me ready to stop", "make sure we're up to date before I go", or otherwise signals he's pausing and wants the current state captured so nothing is lost. Also use proactively at the natural end of a work session if he's about to step away. Produces three things: verified git/deploy state, refreshed auto-loading memory files, and a portable HANDOFF.md at the repo root.
---

# SetList session handoff

The goal is that Greg (or a fresh Claude session, in any tool) can pick up **exactly** where this session left off with zero lost context — what's done, what's next, why decisions were made, and what landmines to avoid. This is a *curated* snapshot, never a raw transcript dump: a new chat pasting 200KB of raw log wastes its context and buries the signal. Capture the state that matters, not every keystroke.

There are two continuity mechanisms, and this skill refreshes both because they cover different cases:
- **Memory files** auto-load into a new Claude Code session *in this project folder* — so a same-folder resume needs almost nothing from the user.
- **HANDOFF.md** is a portable, self-contained doc Greg can paste into a chat *anywhere else* (claude.ai web, mobile, a different machine) where memory doesn't auto-load.

## Step 1 — Verify git and deploy state (don't guess it)

Report facts, not assumptions. Run:

```
git rev-parse HEAD
git rev-parse origin/main
git status --short
git log --oneline -8
```

Establish, concretely: is the working tree clean? Does local `main` match `origin/main` (i.e. is everything pushed)? What are the most recent commits? If the tree is dirty or local is ahead of origin, that is itself a critical handoff fact — surface it prominently and ask Greg whether to commit/push before finalizing, since "every push goes live" (see CLAUDE.md). Never write a handoff that implies things are saved when they aren't.

If a recent change touched anything the Vercel deploy serves and its deploy status hasn't been confirmed this session, note that too. (Deploy status can be checked via the GitHub commit-status API for the relevant SHA — see how it's done in the session history if needed.)

## Step 2 — Refresh the auto-loading memory files

The memory directory for this project is at:
`C:\Users\ghunt\.claude\projects\C--Users-ghunt-setlist\memory\`

Read `MEMORY.md` (the index) and the files it points to. Update whatever has changed this session — most often `setlist-project-status.md` (current phase, what just shipped, what's next, open threads). Keep each memory file to one durable fact with its frontmatter intact; don't dump session narrative into them. If something genuinely new and durable emerged (a new preference, a new hard-won gotcha, a new external reference), add a file and a one-line pointer in `MEMORY.md`. Follow the memory conventions already established in this project's memory dir — match the existing files' shape rather than inventing a new format.

The point of this step: a fresh Claude Code session opened in this folder should load these and already know where things stand, without Greg re-explaining.

## Step 3 — Write the portable HANDOFF.md at the repo root

Write (overwrite) `HANDOFF.md` at the project root — `C:\Users\ghunt\setlist\HANDOFF.md`. This is the paste-anywhere artifact. It must stand completely on its own: assume the reader has *none* of this session's context and isn't necessarily in the project folder.

Use this structure (adapt as needed, but keep it tight and skimmable):

```
# SetList — Session Handoff (as of <absolute date + time, with timezone>)

## What SetList is (one paragraph)
<Enough for a cold reader to understand the product. Pull from CLAUDE.md.>

## Current state — verified
- Git: <clean/dirty>, local <matches / ahead of> origin, HEAD is <sha> "<subject>"
- Deploy: <live URL + confirmed/unconfirmed>
- Last few commits: <3–5 one-liners>

## Where we are on the roadmap
<Current phase, what's done, what's explicitly next. Point to the live Drive roadmap doc by name + link if relevant.>

## What shipped this session
<Bullets of what actually changed and landed, with the "why" where it isn't obvious.>

## What's next (the actual next actionable thing)
<The single clearest next task, plus any queued-but-undecided items and the open question attached to each.>

## Key decisions & why
<Non-obvious calls made and their reasoning, so they don't get re-litigated or accidentally reversed.>

## Gotchas / landmines
<Things that will bite a fresh session. Cross-reference CLAUDE.md conventions for the big ones rather than restating them in full.>

## Pointers
- Repo: C:\Users\ghunt\setlist  (prod: <url>)
- Roadmap (Drive): <name + link>
- Brand kit: brand-kit/  · Conventions & architecture: CLAUDE.md
- Memory (auto-loads in a new Claude Code session here): <memory dir path>

## How to resume
- New Claude Code session in this folder: memory + CLAUDE.md auto-load; just say "where were we".
- Any other tool (claude.ai web, mobile, etc.): paste this whole file as the first message.
```

Pull real content from the actual sources — CLAUDE.md, the current Drive roadmap doc, the memory files, and this session's work — rather than from assumption. Where a fact can drift (deploy status, "latest" roadmap doc among several), state how it was verified or point to how to re-verify.

## Step 4 — Confirm and hand back

Tell Greg concisely what was captured: git/deploy state as verified, which memory files were refreshed, and that `HANDOFF.md` is written at the repo root. Remind him of the two resume paths (same folder = automatic; anywhere else = paste HANDOFF.md). If Step 1 surfaced anything unsaved, make that the headline, not a footnote.

Note: `HANDOFF.md` and the refreshed memory files are ordinary working changes. Committing them is subject to the same rule as everything else here — only commit/push when Greg's happy with the state (every push goes live). Offer, don't assume.
