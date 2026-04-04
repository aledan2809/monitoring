/**
 * Service Health Monitor
 *
 * Polls HTTP health endpoints at configurable intervals and sends
 * WhatsApp alerts via Meta Cloud API when services degrade or go down.
 *
 * Usage:
 *   node service-monitor.mjs                    # Run with defaults
 *   node service-monitor.mjs --interval 60      # Poll every 60s
 *   node service-monitor.mjs --once             # Single check, then exit
 *
 * Environment variables (or .env file):
 *   WHATSAPP_PHONE_NUMBER_ID  — Meta phone number ID
 *   WHATSAPP_ACCESS_TOKEN     — Meta access token
 *   ALERT_PHONE               — Phone number to alert (e.g., 40749591399)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Load .env ────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── Configuration ────────────────────────────────────

const POLL_INTERVAL_S = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--interval') || '120');
const SINGLE_RUN = process.argv.includes('--once');

const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const ALERT_PHONE = process.env.ALERT_PHONE || '40749591399';

// Services to monitor — extend this array for more services
const SERVICES = [
  // VPS1 (187.77.179.159)
  { name: 'PRO', healthUrl: 'https://profitness.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'eCabinet', healthUrl: 'https://ecabinet.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: '4pro-biz', healthUrl: 'https://biz.4pro.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: '4pro-client', healthUrl: 'https://app.4pro.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: '4pro-identity', healthUrl: 'https://id.4pro.ro/health', timeout: 15000, failThreshold: 2 },
  { name: '4pro-landing', healthUrl: 'https://4pro.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'MarketingAutomation', healthUrl: 'https://marketingautomation.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'AVE Platform', healthUrl: 'https://ave-platform.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'AIWebAuditor', healthUrl: 'https://aiwebauditor.com/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'TechBiz Landing', healthUrl: 'https://techbiz.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'Tester', healthUrl: 'https://tester.aledan.dev/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'Website Guru', healthUrl: 'https://website-guru.ro/api/health', timeout: 15000, failThreshold: 2 },
  // VPS2 (72.62.155.74)
  { name: 'Source', healthUrl: 'https://source.aledan.dev/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'Tutor', healthUrl: 'https://tutor.aledan.dev/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'TradeInvest', healthUrl: 'https://tradeinvest.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'ProcuChain', healthUrl: 'https://procuchain.com/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'TeInformez', healthUrl: 'https://teinformez.ro/api/health', timeout: 15000, failThreshold: 2 },
  // Vercel
  { name: 'KnowBest', healthUrl: 'https://app.knowbest.ro/api/health', timeout: 15000, failThreshold: 2 },
  { name: 'UtilajHub', healthUrl: 'https://utilajhub.ro/api/health', timeout: 15000, failThreshold: 2 },
];

// ─── State tracking ───────────────────────────────────

const state = new Map(); // name → { status, failCount, lastAlertAt, lastDetails }

for (const svc of SERVICES) {
  state.set(svc.name, {
    status: 'unknown',
    failCount: 0,
    lastAlertAt: 0,
    lastDetails: '',
  });
}

// Cooldown: don't re-alert for same issue within 30 minutes
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

// ─── WhatsApp sender ──────────────────────────────────

async function sendWhatsAppAlert(serviceName, statusText, details) {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.error('[WhatsApp] Missing credentials — alert NOT sent');
    return false;
  }

  const url = `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: ALERT_PHONE,
        type: 'template',
        template: {
          name: 'service_alert',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: serviceName },
                { type: 'text', text: statusText },
                { type: 'text', text: details },
              ],
            },
            {
              type: 'button',
              sub_type: 'quick_reply',
              index: 0,
              parameters: [{ type: 'payload', payload: 'acknowledged' }],
            },
          ],
        },
      }),
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`[WhatsApp] Alert sent to ${ALERT_PHONE} — msgId: ${data.messages?.[0]?.id}`);
      return true;
    } else {
      console.error(`[WhatsApp] API error: ${JSON.stringify(data.error || data)}`);
      return false;
    }
  } catch (err) {
    console.error(`[WhatsApp] Failed to send: ${err.message}`);
    return false;
  }
}

// ─── Health checker ───────────────────────────────────

async function checkService(svc) {
  const svcState = state.get(svc.name);
  const now = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), svc.timeout);

    const res = await fetch(svc.healthUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const body = await res.json();
    const status = body.status || 'unknown';
    const prevStatus = svcState.status;

    // Build details string from response
    const detailParts = [];
    if (body.details && Array.isArray(body.details)) {
      for (const d of body.details) {
        const icon = d.status === 'healthy' ? '✅' : d.status === 'degraded' ? '⚠️' : '❌';
        detailParts.push(`${icon} ${d.name}: ${d.details || d.status}`);
      }
    }
    const details = detailParts.join('\n') || `Status: ${status}`;

    if (status === 'healthy') {
      // Recovery — notify if was previously unhealthy
      if (prevStatus !== 'healthy' && prevStatus !== 'unknown') {
        console.log(`[${svc.name}] ✅ RECOVERED → healthy`);
        // Send recovery alert
        await sendWhatsAppAlert(
          svc.name,
          'RECOVERED ✅',
          `Service has recovered and is now fully operational.\n${details}`
        );
      } else {
        console.log(`[${svc.name}] ✅ healthy (${body.details?.[0]?.latency || '?'}ms db)`);
      }
      svcState.status = 'healthy';
      svcState.failCount = 0;
      svcState.lastDetails = details;
    } else {
      // Degraded or down
      svcState.failCount++;
      svcState.status = status;
      svcState.lastDetails = details;

      console.log(`[${svc.name}] ⚠️ ${status.toUpperCase()} (fail #${svcState.failCount})`);

      // Alert if threshold reached and cooldown passed
      if (
        svcState.failCount >= svc.failThreshold &&
        (now - svcState.lastAlertAt) > ALERT_COOLDOWN_MS
      ) {
        console.log(`[${svc.name}] 🔔 Sending WhatsApp alert...`);
        const sent = await sendWhatsAppAlert(svc.name, status.toUpperCase(), details);
        if (sent) svcState.lastAlertAt = now;
      }
    }
  } catch (err) {
    svcState.failCount++;
    svcState.status = 'unreachable';
    const details = `Service is unreachable: ${err.message}`;
    svcState.lastDetails = details;

    console.error(`[${svc.name}] ❌ UNREACHABLE (fail #${svcState.failCount}): ${err.message}`);

    if (
      svcState.failCount >= svc.failThreshold &&
      (now - svcState.lastAlertAt) > ALERT_COOLDOWN_MS
    ) {
      console.log(`[${svc.name}] 🔔 Sending WhatsApp alert...`);
      const sent = await sendWhatsAppAlert(svc.name, 'UNREACHABLE', details);
      if (sent) svcState.lastAlertAt = now;
    }
  }
}

// ─── Report generation ────────────────────────────────

function generateReport() {
  const now = new Date();
  const lines = [
    `# Service Monitor Report`,
    `**Date:** ${now.toISOString()}`,
    '',
    '| Service | Status | Details |',
    '|---------|--------|---------|',
  ];

  for (const [name, s] of state) {
    const icon = s.status === 'healthy' ? '✅' : s.status === 'degraded' ? '⚠️' : '❌';
    lines.push(`| ${name} | ${icon} ${s.status} | ${(s.lastDetails || '').replace(/\n/g, ' · ')} |`);
  }

  lines.push('', `*Generated by Service Monitor*`);

  const reportsDir = path.join(__dirname, 'Reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const filename = `SERVICE_MONITOR_${now.toISOString().slice(0, 10)}.md`;
  fs.writeFileSync(path.join(reportsDir, filename), lines.join('\n'), 'utf-8');
}

// ─── Main loop ────────────────────────────────────────

async function poll() {
  const timestamp = new Date().toLocaleTimeString('ro-RO', { hour12: false });
  console.log(`\n── ${timestamp} ──────────────────────────`);

  for (const svc of SERVICES) {
    await checkService(svc);
  }

  // Generate report every hour (on the hour)
  const min = new Date().getMinutes();
  if (min === 0) generateReport();
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║    Service Health Monitor v1.0           ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Monitoring ${SERVICES.length} service(s)`);
  console.log(`Poll interval: ${POLL_INTERVAL_S}s`);
  console.log(`Alert phone: ${ALERT_PHONE}`);
  console.log(`WhatsApp configured: ${WHATSAPP_PHONE_NUMBER_ID ? 'YES' : 'NO'}`);
  console.log('');

  await poll();

  if (SINGLE_RUN) {
    generateReport();
    console.log('\n[Single run mode — exiting]');
    process.exit(0);
  }

  setInterval(poll, POLL_INTERVAL_S * 1000);
}

main().catch(console.error);
