#!/usr/bin/env node
// Pipeline Monitor - Real-time monitoring for AI Mesh pipelines
// Usage:
//   node monitor.mjs                     # Interactive: select pipelines to monitor
//   node monitor.mjs --watch             # Auto-watch all active pipelines
//   node monitor.mjs --id pipe_xxx       # Monitor specific pipeline
//   node monitor.mjs --failed            # Show failed pipelines with error details
//   node monitor.mjs --all               # Show all pipelines overview

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';
import { config, paths } from './config.mjs';
import {
  loadPipelines,
  loadTasks,
  getLogTail,
  extractErrors,
  formatDuration,
  formatDate
} from './utils.mjs';

// ─── ANSI Colors ───
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

function stateColor(state) {
  const map = {
    idle: C.dim,
    planning: C.yellow,
    waiting_clarification: C.magenta,
    dev: C.cyan,
    qa: C.blue,
    deploy: C.yellow,
    monitor: C.blue,
    waiting_validation: C.magenta,
    done: C.green,
    failed: C.red,
    paused: C.dim,
  };
  return map[state] || C.white;
}

function stateIcon(state) {
  const map = {
    idle: '○',
    planning: '◐',
    waiting_clarification: '?',
    dev: '⚙',
    qa: '✓',
    deploy: '↑',
    monitor: '◉',
    waiting_validation: '…',
    done: '●',
    failed: '✗',
    paused: '‖',
  };
  return map[state] || '·';
}

// Functions moved to utils.mjs to eliminate duplication

// ─── Validation Checks ───
// Lesson learned: never mark a pipeline "done" without verifying the output actually works.

function validatePipeline(pipeline, task) {
  const warnings = [];
  const projectPath = task?.projectPath || pipeline?.projectPath;

  if (pipeline.state === 'done' || pipeline.state === 'waiting_validation') {
    // Check 1: Did it produce any git commits?
    if (projectPath) {
      try {
        const log = execSync(`git log --oneline --since="1 hour ago" -5`, {
          cwd: projectPath, encoding: 'utf8', timeout: 5000
        }).trim();
        if (!log) {
          warnings.push('NO COMMITS in last hour — verify if dev agent actually made changes');
        }
      } catch {
        warnings.push('Could not check git log for project');
      }
    }

    // Check 2: Log file has actual output (not just "Running dev agent")
    const log = getLogTail(pipeline.id, 50);
    if (!log || log.trim().length < 100) {
      warnings.push('LOG EMPTY or very short — dev agent may not have done real work');
    }

    // Check 3: Check for known failure patterns even in "done" state
    if (log) {
      if (/ENOSPC|no space left/i.test(log)) warnings.push('DISK FULL errors detected in log');
      if (/ETIMEDOUT/i.test(log)) warnings.push('TIMEOUT errors detected in log');
      if (/EPERM|permission denied/i.test(log)) warnings.push('PERMISSION errors detected in log');
      if (/exit code: 1/i.test(log)) warnings.push('Process exited with error code 1');
    }

    // Check 4: Pipeline completed in first iteration - may need manual verification
    if (pipeline.iteration === 1 && pipeline.state === 'done') {
      warnings.push('COMPLETED IN SINGLE ITERATION — verify task was actually complex enough to warrant automation');
    }
  }

  return warnings;
}

// Functions moved to utils.mjs

// ─── Display Functions ───

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function printHeader() {
  console.log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║          AI Pipeline Monitor - Real-time Dashboard          ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  Updated: ${new Date().toLocaleString('ro-RO')}${C.reset}\n`);
}

function printPipelineSummary(pipeline, task) {
  const sc = stateColor(pipeline.state);
  const icon = stateIcon(pipeline.state);
  const name = pipeline.projectName || pipeline.project || pipeline.id;
  const created = formatDate(pipeline.createdAt);
  const updated = formatDate(pipeline.updatedAt);
  const duration = pipeline.createdAt && pipeline.updatedAt
    ? formatDuration(new Date(pipeline.updatedAt) - new Date(pipeline.createdAt))
    : '—';

  console.log(`${C.bold}  ${sc}${icon} ${name}${C.reset}  ${C.dim}[${pipeline.id}]${C.reset}`);
  console.log(`    State: ${sc}${C.bold}${pipeline.state.toUpperCase()}${C.reset}  │  Started: ${created}  │  Updated: ${updated}  │  Duration: ${duration}`);

  if (task) {
    const desc = task.description || '';
    const shortDesc = desc.length > 80 ? desc.substring(0, 80) + '…' : desc;
    console.log(`    Task: ${C.dim}${shortDesc}${C.reset}`);
    if (task.model) console.log(`    Model: ${C.yellow}${task.model}${C.reset}`);
  }

  // Show token usage if available
  if (pipeline.stateData?.tokenUsage) {
    const tu = pipeline.stateData.tokenUsage;
    const totalTokens = (tu.input || 0) + (tu.output || 0);
    const cost = tu.cost || 0;
    if (totalTokens > 0) {
      console.log(`    Tokens: ${C.dim}in=${tu.input || 0} out=${tu.output || 0} total=${totalTokens} cost=$${cost.toFixed(4)}${C.reset}`);
    }
  }

  // Show validation warnings for done/waiting_validation pipelines
  if (pipeline.state === 'done' || pipeline.state === 'waiting_validation') {
    const warnings = validatePipeline(pipeline, task);
    if (warnings.length > 0) {
      console.log(`    ${C.bgYellow}${C.bold} VALIDATION WARNINGS ${C.reset}`);
      for (const w of warnings) {
        console.log(`    ${C.yellow}⚠ ${w}${C.reset}`);
      }
    }
  }

  // Show clarification questions if in that state
  if (pipeline.state === 'waiting_clarification' && pipeline.stateData?.clarificationQuestions) {
    console.log(`    ${C.magenta}Questions pending:${C.reset}`);
    for (const q of pipeline.stateData.clarificationQuestions) {
      console.log(`      ${C.magenta}? ${q}${C.reset}`);
    }
  }
}

function printPipelineDetail(pipeline, task) {
  printPipelineSummary(pipeline, task);

  const log = getLogTail(pipeline.id, 40);
  if (log) {
    console.log(`\n    ${C.bold}Log (last 40 lines):${C.reset}`);
    const lines = log.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let color = C.dim;
      if (/error|fail|ENOSPC|EPERM/i.test(line)) color = C.red;
      else if (/success|done|finish/i.test(line)) color = C.green;
      else if (/\[.*\]/i.test(line)) color = C.cyan;
      else if (/^={5,}/.test(line)) color = C.yellow;
      console.log(`    ${color}${line}${C.reset}`);
    }

    if (pipeline.state === 'failed') {
      const errors = extractErrors(log);
      if (errors.length > 0) {
        console.log(`\n    ${C.bgRed}${C.white}${C.bold} ROOT CAUSE ANALYSIS ${C.reset}`);
        for (const err of errors) {
          console.log(`    ${C.red}→ ${err}${C.reset}`);
        }
      }
    }
  }
  console.log();
}

function printOverview(pipelines, tasks) {
  const sorted = [...pipelines].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime() || 0;
    const tb = new Date(b.createdAt).getTime() || 0;
    return tb - ta;
  });

  const active = sorted.filter(p => !['done', 'failed'].includes(p.state));
  const failed = sorted.filter(p => p.state === 'failed');
  const done = sorted.filter(p => p.state === 'done');

  console.log(`${C.bold}  Summary: ${C.green}${done.length} done${C.reset} │ ${C.cyan}${active.length} active${C.reset} │ ${C.red}${failed.length} failed${C.reset} │ ${C.dim}${sorted.length} total${C.reset}\n`);

  if (active.length > 0) {
    console.log(`${C.bold}${C.cyan}  ── Active Pipelines ──${C.reset}\n`);
    for (const p of active) {
      const task = tasks.find(t => t.pipelineId === p.id);
      printPipelineSummary(p, task);
      console.log();
    }
  }

  if (failed.length > 0) {
    console.log(`${C.bold}${C.red}  ── Failed Pipelines (last 5) ──${C.reset}\n`);
    for (const p of failed.slice(0, 5)) {
      const task = tasks.find(t => t.pipelineId === p.id);
      printPipelineSummary(p, task);
      // Show error summary for failed
      const log = getLogTail(p.id, 50);
      const errors = extractErrors(log);
      if (errors.length > 0) {
        console.log(`    ${C.red}Errors:${C.reset}`);
        for (const err of errors.slice(-3)) {
          console.log(`      ${C.red}→ ${err.substring(0, 120)}${C.reset}`);
        }
      }
      console.log();
    }
  }

  if (done.length > 0) {
    console.log(`${C.bold}${C.green}  ── Completed Pipelines (last 5) ──${C.reset}\n`);
    for (const p of done.slice(0, 5)) {
      const task = tasks.find(t => t.pipelineId === p.id);
      printPipelineSummary(p, task);
      console.log();
    }
  }
}

// ─── Interactive Mode ───

async function interactiveSelect(pipelines, tasks) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log(`\n${C.bold}  Select pipelines to monitor:${C.reset}\n`);

  const sorted = [...pipelines].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime() || 0;
    const tb = new Date(b.createdAt).getTime() || 0;
    return tb - ta;
  });

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const sc = stateColor(p.state);
    const icon = stateIcon(p.state);
    const name = p.projectName || p.project || p.id;
    const created = formatDate(p.createdAt);
    console.log(`  ${C.bold}${i + 1}.${C.reset} ${sc}${icon} ${name}${C.reset} [${sc}${p.state}${C.reset}] ${C.dim}${created}${C.reset}`);
  }

  console.log(`\n  ${C.dim}Enter numbers (comma-separated), 'a' for active, 'f' for failed, 'all' for all:${C.reset}`);
  const answer = await ask('  > ');
  rl.close();

  let selected = [];
  const input = answer.trim().toLowerCase();

  if (input === 'a' || input === 'active') {
    selected = sorted.filter(p => !['done', 'failed'].includes(p.state));
  } else if (input === 'f' || input === 'failed') {
    selected = sorted.filter(p => p.state === 'failed');
  } else if (input === 'all') {
    selected = sorted;
  } else {
    const nums = input.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    selected = nums.map(n => sorted[n - 1]).filter(Boolean);
  }

  return selected;
}

// ─── Watch Mode ───

async function watchPipelines(pipelineIds, interval = config.REFRESH_INTERVAL) {
  let prevStates = {};

  const check = () => {
    const data = loadPipelines();
    const tasks = loadTasks().tasks || [];
    const watching = pipelineIds.length > 0
      ? data.pipelines.filter(p => pipelineIds.includes(p.id))
      : data.pipelines.filter(p => !['done', 'failed'].includes(p.state));

    clearScreen();
    printHeader();

    if (watching.length === 0) {
      console.log(`  ${C.dim}No pipelines to watch. All done or failed.${C.reset}\n`);
      printOverview(data.pipelines, tasks);
      return;
    }

    console.log(`  ${C.bold}Watching ${watching.length} pipeline(s):${C.reset}\n`);

    for (const p of watching) {
      const task = tasks.find(t => t.pipelineId === p.id);
      printPipelineDetail(p, task);

      // Detect state changes
      if (prevStates[p.id] && prevStates[p.id] !== p.state) {
        console.log(`    ${C.bgYellow}${C.bold} STATE CHANGE: ${prevStates[p.id]} → ${p.state} ${C.reset}\n`);
      }
      prevStates[p.id] = p.state;
    }

    console.log(`${C.dim}  Press Ctrl+C to exit. Refreshing every ${interval / 1000}s...${C.reset}`);
  };

  check();
  setInterval(check, interval);
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);

  printHeader();

  const data = loadPipelines();
  const tasks = loadTasks().tasks || [];

  if (data.pipelines.length === 0) {
    console.log(`  ${C.red}No pipelines found in ${paths.PIPELINES_FILE}${C.reset}`);
    process.exit(1);
  }

  // --all: overview
  if (args.includes('--all')) {
    printOverview(data.pipelines, tasks);
    process.exit(0);
  }

  // --failed: show failed with details
  if (args.includes('--failed')) {
    const failed = data.pipelines.filter(p => p.state === 'failed');
    if (failed.length === 0) {
      console.log(`  ${C.green}No failed pipelines!${C.reset}`);
      process.exit(0);
    }
    console.log(`${C.bold}${C.red}  Failed Pipelines (${failed.length}):${C.reset}\n`);
    for (const p of failed) {
      const task = tasks.find(t => t.pipelineId === p.id);
      printPipelineDetail(p, task);
    }
    process.exit(0);
  }

  // --id: monitor specific pipeline
  const idIdx = args.indexOf('--id');
  if (idIdx >= 0 && args[idIdx + 1]) {
    const targetId = args[idIdx + 1];
    const pipeline = data.pipelines.find(p => p.id === targetId);
    if (!pipeline) {
      console.log(`  ${C.red}Pipeline ${targetId} not found${C.reset}`);
      process.exit(1);
    }
    if (args.includes('--watch')) {
      await watchPipelines([targetId]);
    } else {
      const task = tasks.find(t => t.pipelineId === targetId);
      printPipelineDetail(pipeline, task);
    }
    return;
  }

  // --watch: auto-watch active
  if (args.includes('--watch')) {
    const active = data.pipelines.filter(p => !['done', 'failed'].includes(p.state));
    if (active.length === 0) {
      console.log(`  ${C.dim}No active pipelines. Showing overview instead.${C.reset}\n`);
      printOverview(data.pipelines, tasks);
      process.exit(0);
    }
    await watchPipelines(active.map(p => p.id));
    return;
  }

  // Default: interactive selection
  printOverview(data.pipelines, tasks);

  const selected = await interactiveSelect(data.pipelines, tasks);
  if (selected.length === 0) {
    console.log(`  ${C.dim}No pipelines selected.${C.reset}`);
    process.exit(0);
  }

  console.log(`\n${C.bold}  Detailed view for ${selected.length} pipeline(s):${C.reset}\n`);
  for (const p of selected) {
    const task = tasks.find(t => t.pipelineId === p.id);
    printPipelineDetail(p, task);
  }

  // Ask if they want to watch
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(r => rl.question(`\n  ${C.bold}Watch these pipelines in real-time? (y/n): ${C.reset}`, r));
  rl.close();

  if (answer.trim().toLowerCase() === 'y') {
    await watchPipelines(selected.map(p => p.id));
  }
}

main().catch(e => {
  console.error(`${C.red}Monitor error: ${e.message}${C.reset}`);
  process.exit(1);
});
