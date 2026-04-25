// Common utilities for Pipeline Monitor
// Eliminates code duplication between monitor.mjs and watch-1h.mjs

import fs from 'fs';
import path from 'path';
import { paths } from './config.mjs';

// ─── File I/O Utilities ───

export function loadPipelines() {
  try {
    return JSON.parse(fs.readFileSync(paths.PIPELINES_FILE, 'utf8'));
  } catch {
    return { pipelines: [] };
  }
}

export function loadTasks() {
  try {
    return JSON.parse(fs.readFileSync(paths.TASKS_FILE, 'utf8'));
  } catch {
    return { tasks: [] };
  }
}

export function getLogTail(pipelineId, lines = 30) {
  const logPath = path.join(paths.STATE_DIR, `log_${pipelineId}.txt`);
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  } catch {
    return null;
  }
}

export function extractErrors(logContent) {
  if (!logContent) return [];
  const errors = [];
  const lines = logContent.split('\n');
  for (const line of lines) {
    if (/error|ENOSPC|EPERM|ENOENT|failed|exception|ETIMEDOUT/i.test(line) && line.trim().length > 5) {
      errors.push(line.trim());
    }
  }
  return [...new Set(errors)].slice(-10);
}

// ─── Time/Date Utilities ───

export function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function generateTimestamp() {
  return new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .substring(0, 19);
}

// ─── Pipeline State Utilities ───

export function getActivePipelines(pipelines = null) {
  const pipes = pipelines || loadPipelines().pipelines || [];
  return pipes.filter(p => !['done', 'failed'].includes(p.state));
}

export function getNewLogLines(pipelineId, logSizes) {
  const logFile = path.join(paths.STATE_DIR, `log_${pipelineId}.txt`);
  try {
    const stat = fs.statSync(logFile);
    const prev = logSizes[pipelineId] || 0;
    if (stat.size <= prev) return [];
    const content = fs.readFileSync(logFile, 'utf8');
    const newContent = content.substring(prev);
    logSizes[pipelineId] = stat.size;
    return newContent.trim().split('\n').filter(l => l.trim());
  } catch {
    return [];
  }
}

export function getAllPipelinesWithFallback() {
  try {
    const raw = fs.readFileSync(paths.PIPELINES_FILE, 'utf8');
    if (!raw || raw.trim().length < 2) {
      // Try backup
      const bakFile = paths.PIPELINES_FILE + '.bak';
      if (fs.existsSync(bakFile)) {
        const bakRaw = fs.readFileSync(bakFile, 'utf8');
        return JSON.parse(bakRaw).pipelines || [];
      }
      return [];
    }
    const data = JSON.parse(raw);
    return data.pipelines || [];
  } catch (e) {
    console.error('[utils] Failed to read pipelines:', e.message);
    // Try backup
    try {
      const bakFile = paths.PIPELINES_FILE + '.bak';
      if (fs.existsSync(bakFile)) {
        return JSON.parse(fs.readFileSync(bakFile, 'utf8')).pipelines || [];
      }
    } catch {}
    return [];
  }
}