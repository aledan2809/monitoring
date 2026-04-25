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
