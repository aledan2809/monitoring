// Configuration for Pipeline Monitor
// Centralized configuration to replace hardcoded paths

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Environment variables with fallbacks
export const config = {
  // Master project root - can be overridden with MASTER_ROOT env var
  MASTER_ROOT: process.env.MASTER_ROOT || 'C:/Projects/Master',

  // Monitoring project root - can be overridden with MONITOR_DIR env var
  MONITOR_DIR: process.env.MONITOR_DIR || __dirname,

  // Polling interval for watcher (milliseconds)
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL) || 30000,

  // Default refresh interval for monitor (milliseconds)
  REFRESH_INTERVAL: parseInt(process.env.REFRESH_INTERVAL) || 5000,
};

// Derived paths
export const paths = {
  STATE_DIR: path.join(config.MASTER_ROOT, 'mesh/state'),
  PIPELINES_FILE: path.join(config.MASTER_ROOT, 'mesh/state/pipelines.json'),
  TASKS_FILE: path.join(config.MASTER_ROOT, 'mesh/state/tasks.json'),
  REPORTS_DIR: path.join(config.MONITOR_DIR, 'Reports'),
};

// Ensure Reports directory exists
import fs from 'fs';
if (!fs.existsSync(paths.REPORTS_DIR)) {
  fs.mkdirSync(paths.REPORTS_DIR, { recursive: true });
}