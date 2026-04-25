# Lessons Learned — monitoring

> Incident root causes and patterns specific to monitoring (AI Pipeline Monitor CLI).
> Master-level lessons: `Master/knowledge/lessons-learned.md`.

## Lessons

#### L01: Project code untracked for 45+ days — `git status` reported "13 modified" but real-changes diff was 0
- **Date**: 2026-04-25
- **Category**: Git / Recovery / Cross-platform
- **Lesson**: Optimise auditor flagged monitoring as STALE_WIP with 13 modified files for 45 days. `git diff --ignore-cr-at-eol --stat` returned EMPTY (real=0) — all 13 entries were CRLF/LF flips on previously-tracked files. But the actual project codebase (`monitor.mjs`, `config.mjs`, `lib/`, `Reports/`, `package.json`, etc.) was UNTRACKED — the only commit on this repo was the initial scaffold from 2026-03-10. The "WIP" perception came from CRLF on the few files that WERE tracked, not from real edits. Real status: project is functional locally but never properly versioned.
- **Action**: (1) **Add proper `.gitignore`**: node_modules, .env, .DS_Store. Done 2026-04-25. (2) **Commit untracked codebase** — Reports/, lib/, monitor.mjs, etc. into source control. (3) **Add `.gitattributes`** with `* text=auto eol=lf` to prevent future CRLF inflation. (4) Cross-ref `Master L43`. (5) **Future Optimise interpretation**: STALE_WIP count alone is misleading; always pair with `real=N` filter to distinguish CRLF noise from genuine WIP. (6) For monitoring specifically: deploy story is "local CLI tool only" per ECOSYSTEM_REGISTRY, so version control hygiene was deprioritized — but the cost of NOT being version-controlled is exactly this kind of state-drift over 45 days.

---

## How to Add New Lessons

1. Identify the lesson from your project work
2. Add it under an appropriate category
3. Follow the format above
4. Cross-reference Master L## if the pattern applies broadly
