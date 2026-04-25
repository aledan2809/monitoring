# Pipeline Monitor

Real-time monitoring tool for AI Mesh pipelines. Provides interactive CLI dashboard and automated reporting capabilities.

## Features

- **Interactive Dashboard**: Real-time monitoring with color-coded states, token usage, and error analysis
- **Multiple View Modes**: Overview, filtered views (failed, active), and detailed pipeline inspection
- **Automated Watching**: Time-limited or autonomous monitoring with automatic report generation
- **Validation Checks**: Automatic verification of completed pipelines (git commits, log analysis, error detection)
- **Error Analysis**: Root cause analysis for failed pipelines with error deduplication

## Requirements

- **Node.js 18+** (uses ES modules)
- **Git** (for pipeline validation)
- Access to Master AI Mesh state directory

## Installation

```bash
cd C:/Projects/monitoring
npm install  # No external dependencies
```

## Configuration

### Environment Variables

Configure paths via environment variables (optional):

```bash
# Master project location (default: C:/Projects/Master)
export MASTER_ROOT=/path/to/master

# Monitoring project directory (default: current directory)
export MONITOR_DIR=/path/to/monitoring

# Polling interval for watcher in ms (default: 30000)
export POLL_INTERVAL=30000

# Dashboard refresh interval in ms (default: 5000)
export REFRESH_INTERVAL=5000
```

### Alternative: Modify config.mjs

Edit the `config.mjs` file to change default paths and intervals.

## Usage

### Interactive Monitor

```bash
# Interactive mode: select pipelines from list
node monitor.mjs
# or
npm start
```

### Command Line Options

```bash
# Show overview of all pipelines
node monitor.mjs --all

# Show failed pipelines with error details
node monitor.mjs --failed

# Monitor specific pipeline by ID
node monitor.mjs --id pipe_xxx

# Monitor specific pipeline with real-time updates
node monitor.mjs --id pipe_xxx --watch

# Auto-watch all active pipelines
node monitor.mjs --watch
# or
npm run watch
```

### Automated Watcher with Reports

```bash
# Monitor for 3 hours (default), then generate report
node watch-1h.mjs

# Monitor for custom duration
node watch-1h.mjs --hours 5

# Monitor until ALL pipelines complete successfully (no timeout)
node watch-1h.mjs --autonomous
```

## Output

### Dashboard Features

- **Color-coded states**: idle, planning, dev, qa, deploy, monitor, done, failed, etc.
- **Pipeline summary**: Name, ID, state, timestamps, duration, token usage, cost
- **Validation warnings**: For completed pipelines (git check, log analysis)
- **Real-time log viewer**: Last 40 lines with syntax highlighting
- **Error analysis**: Automatic error extraction and deduplication for failed pipelines
- **State change notifications**: Live detection of pipeline transitions

### Generated Reports

Reports are saved in `Reports/` directory with timestamps:
- `Reports/monitor_2026-03-22_10-30-15.md`

Report includes:
- Executive summary (done/active/failed counts)
- State change log during monitoring
- Detailed pipeline information with logs
- Error analysis for failed pipelines
- Global status table with timestamps

### Pipeline States Recognized

| State | Icon | Description |
|-------|------|-------------|
| idle | ○ | Waiting to start |
| planning | ◐ | Creating execution plan |
| waiting_clarification | ? | Needs user input |
| dev | ⚙ | Development in progress |
| qa | ✓ | Quality assurance |
| deploy | ↑ | Deployment phase |
| monitor | ◉ | Monitoring deployment |
| waiting_validation | … | Awaiting manual validation |
| done | ● | Completed successfully |
| failed | ✗ | Failed with errors |
| paused | ‖ | Manually paused |

## Validation Checks

Completed pipelines (`done`/`waiting_validation`) are automatically validated:

1. **Git commits**: Verifies development actually produced commits in last hour
2. **Log content**: Ensures log file has substantial output (>100 chars)
3. **Error patterns**: Scans for disk space, permission, timeout errors
4. **Single iteration**: Flags pipelines that completed too quickly

## Architecture

- **monitor.mjs**: Interactive CLI with real-time dashboard
- **watch-1h.mjs**: Autonomous watcher with report generation
- **config.mjs**: Centralized configuration and path management
- **utils.mjs**: Shared utilities (eliminates code duplication)

State is read from Master mesh files:
- `{MASTER_ROOT}/mesh/state/pipelines.json`
- `{MASTER_ROOT}/mesh/state/tasks.json`
- `{MASTER_ROOT}/mesh/state/log_{pipeline_id}.txt`

## Error Recovery

- **JSON corruption**: Automatic fallback to `.bak` files
- **Missing files**: Graceful degradation with empty state
- **Log file issues**: Safe handling of missing/unreadable logs
- **Git command failures**: Validation continues with warnings

## Examples

### Quick Status Check
```bash
node monitor.mjs --all
```

### Debug Failed Pipeline
```bash
node monitor.mjs --failed
```

### Long-term Monitoring
```bash
# Run overnight monitoring
node watch-1h.mjs --autonomous

# Monitor for 8 hours
node watch-1h.mjs --hours 8
```

### Interactive Workflow
```bash
# Start interactive mode
node monitor.mjs

# Select pipelines to monitor
# Enter: a (active), f (failed), 1,2,3 (specific), or all

# Choose to watch in real-time
# Enter: y (watch) or n (exit)
```

---

**Built for AI Mesh Pipeline Management** • **Zero external dependencies** • **Node.js 18+**