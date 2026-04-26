# monitoring — AI Pipeline CLI Monitor & Watcher

## Overview
Real-time CLI dashboard + autonomous watcher for Master AI Mesh pipelines. WhatsApp alerts for service health.

## Stack
- Node.js 18+ (ES modules), native APIs only
- ai-router (imported, available for AI-powered insights)
- Deploy: Local CLI tool

## Run
```bash
npm start              # Interactive dashboard
npm run watch          # Autonomous 1h watcher + report
npm run service-monitor  # WhatsApp health alerts
```

## Key Files
- `monitor.mjs` — Interactive CLI dashboard (391 LOC)
- `watch-1h.mjs` — Autonomous watcher + markdown report gen
- `service-monitor.mjs` — WhatsApp health alerts
- `config.mjs` — Centralized config
- `lib/ai-router.mjs` — AI routing (available)

## DO NOT MODIFY
- Pipeline state parsing logic
- WhatsApp alert format
- Report markdown structure


## Governance Reference
See: `Master/knowledge/MASTER_SYSTEM.md` §1-§5. This project follows Master governance; do not duplicate rules.

Project-level rules (Master/CLAUDE.md is the source of truth):
- **Credentials** live in `Master/credentials/` (per Master §5). Never check secrets into this repo.
- **Audit ledger** — for any NO-TOUCH or RESTRICT classified zones, propose-confirm-apply per edit + AUDIT_GAPS.md entry per change (per Master §2d).
- **Pre-commit scope verification** — declare expected staged scope + run `Master/scripts/pre-commit-scope-verify.sh` before commits to avoid prior-uncommitted-work blowups (per Master memory `feedback_pre_commit_scope_verify`).
- **Cross-project impact** — modifications that affect deploy / shared libs / consumer projects require a Master classification check first (per `Master/CLASSIFICATION.md`).
