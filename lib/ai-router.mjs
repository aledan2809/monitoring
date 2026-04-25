// AI Router — Monitoring preset
// Free providers first, Claude fallback
// Usage: import { router, routeAI } from './lib/ai-router.mjs';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { AIRouter, getProjectPreset } = require('ai-router');

// Use 'monitoring' preset — falls back to default (free providers first, paid last)
const preset = getProjectPreset('monitoring');

const router = new AIRouter({
  ...preset,
  projectName: 'Monitoring',
  defaultProvider: 'auto',
  maxRetries: 2,
  retryDelayMs: 2000,
  maxInputChars: 4000,
});

/**
 * Route an AI request through the smart router.
 * Free providers are tried first, Claude is the last fallback.
 *
 * @param {string} prompt - The user prompt
 * @param {object} [options] - Optional overrides
 * @param {string} [options.systemPrompt] - System prompt
 * @param {string} [options.provider] - Force a specific provider
 * @param {number} [options.maxTokens] - Max tokens in response
 * @param {number} [options.temperature] - Temperature (0-1)
 * @param {boolean} [options.jsonMode] - Request JSON response
 * @returns {Promise<{text: string, provider: string, model: string, latencyMs: number, tokenUsage: object, fallback?: boolean}>}
 */
export async function routeAI(prompt, options = {}) {
  const messages = [];

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  messages.push({ role: 'user', content: prompt });

  const response = await router.chat({
    messages,
    provider: options.provider,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    jsonMode: options.jsonMode,
    taskHint: options.taskHint,
    speedVsQuality: options.speedVsQuality || 'speed',
  });

  return {
    text: response.text,
    provider: response.provider,
    model: response.model,
    latencyMs: response.latencyMs,
    tokenUsage: response.tokenUsage,
    fallback: response.fallback || false,
  };
}

export { router };
export default router;
