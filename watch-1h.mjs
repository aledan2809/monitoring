#!/usr/bin/env node
// Watch ALL active pipelines, then generate a report
// Usage: node watch-1h.mjs [--hours N] [--autonomous]
//   --hours N       : max monitoring duration (default: 3 hours)
//   --autonomous    : run until ALL pipelines reach 'done' (100% success), no timeout
import fs from 'fs';
import path from 'path';
import { config, paths } from './config.mjs';
import {
  getAllPipelinesWithFallback,
  getActivePipelines,
  getNewLogLines,
  getLogTail,
  generateTimestamp
} from './utils.mjs';

const hoursArg = process.argv.indexOf('--hours');
const HOURS = hoursArg >= 0 ? parseFloat(process.argv[hoursArg + 1]) || 3 : 3;
const AUTONOMOUS = process.argv.includes('--autonomous');
const MAX_DURATION_MS = AUTONOMOUS ? Infinity : HOURS * 60 * 60 * 1000;
const POLL_INTERVAL = config.POLL_INTERVAL;
const startTime = Date.now();

// Generate unique report filename with timestamp
const REPORT_FILE = path.join(paths.REPORTS_DIR, `monitor_${generateTimestamp()}.md`);

const events = [];
const pipelineStates = {}; // id -> last known state
const logSizes = {}; // id -> last log size

function log(msg) {
  const ts = new Date().toLocaleString('ro-RO');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  events.push(line);
}

// Functions moved to utils.mjs to eliminate duplication

function generateReport(reason) {
  const allPipes = getAllPipelinesWithFallback();
  const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);
  const active = allPipes.filter(p => !['done', 'failed'].includes(p.state));
  const done = allPipes.filter(p => p.state === 'done');
  const failed = allPipes.filter(p => p.state === 'failed');

  // Gather errors per pipeline
  const pipeDetails = allPipes
    .filter(p => pipelineStates[p.id]) // only pipelines we tracked
    .map(p => {
      const logTail = getLogTail(p.id, 30);
      const errors = logTail.split('\n')
        .filter(l => /error|fail|ENOSPC|EPERM|ETIMEDOUT|exit code/i.test(l))
        .slice(-5);
      return { ...p, logTail, errors };
    });

  const stateChanges = events.filter(e => e.includes('STATE'));

  const allDone = allPipes.length > 0 && allPipes.every(p => p.state === 'done');
  const successIndicator = allDone ? '✅ ALL PIPELINES COMPLETED SUCCESSFULLY' : '⚠️ NOT ALL PIPELINES SUCCEEDED';

  const report = `# Pipeline Monitor Report
Generated: ${new Date().toLocaleString('ro-RO')}
Monitoring duration: ${elapsed} minutes${AUTONOMOUS ? ' (autonomous mode)' : ` (${HOURS}h window)`}
Stop reason: ${reason}
Mode: ${AUTONOMOUS ? 'AUTONOMOUS (until 100% success)' : 'TIME-LIMITED'}

## Result: ${successIndicator}

## Summary
- **Active**: ${active.length} pipeline(s)
- **Done**: ${done.length} pipeline(s)
- **Failed**: ${failed.length} pipeline(s)
- **Total**: ${allPipes.length}

## State Changes During Monitoring
${stateChanges.length > 0 ? stateChanges.map(e => '- ' + e).join('\n') : '- No state changes detected'}

## Tracked Pipelines Detail
${pipeDetails.map(p => `
### ${p.projectName || p.project || p.id} — ${p.state.toUpperCase()}
- **ID**: ${p.id}
- **Model**: ${p.model || 'N/A'}
- **Started**: ${p.createdAt || 'N/A'}
- **Updated**: ${p.updatedAt || 'N/A'}
- **Iteration**: ${p.iteration || 'N/A'}
${p.errors.length > 0 ? `\n**Errors:**\n${p.errors.map(e => '- ' + e.trim().substring(0, 200)).join('\n')}` : ''}

<details><summary>Last 30 log lines</summary>

\`\`\`
${p.logTail}
\`\`\`
</details>
`).join('\n')}

## All Pipelines Status
| Project | State | Started | Updated |
|---------|-------|---------|---------|
${allPipes.map(p => `| ${p.projectName || p.project || p.id} | ${p.state} | ${p.createdAt ? new Date(p.createdAt).toLocaleString('ro-RO', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'} | ${p.updatedAt ? new Date(p.updatedAt).toLocaleString('ro-RO', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'} |`).join('\n')}

## Full Event Log (${events.length} entries)
${events.map(e => '- ' + e).join('\n')}
`;

  fs.writeFileSync(REPORT_FILE, report);
  log(`Report saved to ${REPORT_FILE}`);
}

function check() {
  const elapsed = Date.now() - startTime;
  const allPipes = getAllPipelinesWithFallback();

  // Track all non-failed pipelines
  for (const pipe of allPipes) {
    if (pipe.state === 'failed' && !pipelineStates[pipe.id]) continue; // skip old failed

    // Detect state changes
    const prev = pipelineStates[pipe.id];
    if (prev && prev !== pipe.state) {
      log(`STATE CHANGE [${pipe.projectName || pipe.project || pipe.id}]: ${prev} -> ${pipe.state}`);
    } else if (!prev && pipe.state !== 'failed') {
      log(`Tracking [${pipe.projectName || pipe.project || pipe.id}]: ${pipe.state}`);
    }
    pipelineStates[pipe.id] = pipe.state;

    // Read new log lines for active pipelines
    if (!['done', 'failed'].includes(pipe.state) || (prev && prev !== pipe.state)) {
      const newLines = getNewLogLines(pipe.id, logSizes);
      const name = pipe.projectName || pipe.project || pipe.id;
      for (const line of newLines.slice(-5)) { // max 5 new lines per check
        log(`[${name}] ${line.substring(0, 200)}`);
      }
      if (newLines.length > 5) {
        log(`[${name}] ... and ${newLines.length - 5} more lines`);
      }
    }
  }

  // Check completion conditions
  const trackedIds = Object.keys(pipelineStates);
  if (trackedIds.length === 0) {
    // No pipelines tracked yet — keep waiting
    const checkNum = Math.round(elapsed / POLL_INTERVAL);
    if (checkNum % 10 === 0) {
      log(`Waiting for pipelines to appear...`);
    }

    // Non-autonomous mode: respect timeout
    if (!AUTONOMOUS && elapsed >= MAX_DURATION_MS) {
      log(`${HOURS}h timeout reached (no pipelines detected)`);
      generateReport(`${HOURS}h monitoring timeout — no pipelines detected`);
      process.exit(0);
    }
    return;
  }

  const trackedPipes = allPipes.filter(p => pipelineStates[p.id]);
  const stillRunning = trackedPipes.filter(p =>
    !['done', 'failed', 'waiting_clarification', 'waiting_validation'].includes(p.state)
  );
  const stalledCount = trackedPipes.filter(p =>
    ['waiting_clarification', 'waiting_validation'].includes(p.state)
  ).length;
  const failedCount = trackedPipes.filter(p => p.state === 'failed').length;
  const doneCount = trackedPipes.filter(p => p.state === 'done').length;

  if (AUTONOMOUS) {
    // AUTONOMOUS MODE: Only exit when ALL tracked pipelines are 'done' (100% success)
    if (doneCount === trackedPipes.length && trackedPipes.length > 0) {
      log('✅ ALL tracked pipelines completed successfully (100% done)');
      generateReport('All pipelines finished successfully (autonomous mode)');
      process.exit(0);
    }

    // Log status periodically
    const checkNum = Math.round(elapsed / POLL_INTERVAL);
    if (checkNum % 10 === 0) {
      const elapsedMin = Math.round(elapsed / 1000 / 60);
      log(`[AUTONOMOUS] Done: ${doneCount}/${trackedPipes.length} | Failed: ${failedCount} | Running: ${stillRunning.length} | Stalled: ${stalledCount} | Elapsed: ${elapsedMin}min`);
      if (failedCount > 0) {
        const failedNames = trackedPipes.filter(p => p.state === 'failed').map(p => p.projectName || p.project || p.id).join(', ');
        log(`[AUTONOMOUS] ⚠️ Failed pipelines: ${failedNames} — waiting for restart/fix`);
      }
    }

    // Safety: generate intermediate report every hour
    if (elapsed > 0 && elapsed % (60 * 60 * 1000) < POLL_INTERVAL) {
      generateReport(`Intermediate report (${Math.round(elapsed / 1000 / 60)}min elapsed, autonomous mode)`);
    }
  } else {
    // TIME-LIMITED MODE: Original behavior
    if (stillRunning.length === 0) {
      if (stalledCount > 0) {
        const checkNum = Math.round(elapsed / POLL_INTERVAL);
        if (checkNum % 10 === 0) {
          log(`No actively running pipelines. ${stalledCount} stalled (waiting for user input).`);
        }
      } else {
        log('All tracked pipelines have finished');
        generateReport('All pipelines finished');
        process.exit(0);
      }
    }

    // Check timeout
    if (elapsed >= MAX_DURATION_MS) {
      log(`${HOURS}h timeout reached`);
      generateReport(`${HOURS}h monitoring timeout`);
      process.exit(0);
    }
  }

  const remaining = AUTONOMOUS ? '∞' : Math.round((MAX_DURATION_MS - elapsed) / 1000 / 60) + 'min';
  const activeNames = getActivePipelines(allPipes).map(p => `${p.projectName || p.project || p.id}(${p.state})`).join(', ');
  const checkNum = Math.round(elapsed / POLL_INTERVAL);
  if (checkNum % 10 === 0) {
    log(`Active: ${activeNames || 'none'} | ${remaining} remaining`);
  }
}

const mode = AUTONOMOUS ? 'AUTONOMOUS (until 100% success)' : `${HOURS}h time-limited`;
log(`Starting pipeline watch — mode: ${mode}, polling every ${POLL_INTERVAL/1000}s`);
check();
setInterval(check, POLL_INTERVAL);
