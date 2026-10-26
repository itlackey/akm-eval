// Diagnostic, not a quality eval. Run with Node 22+ or Bun:
// MODEL_BASE_URL=... MODEL_NAME=... MODEL_API_KEY=... node throughput.mjs LABEL OUTPUT.json
// Endpoint and credential stay out of the saved artifact. Native server timings are collected separately.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function request(model, run) {
  return {
    model,
    messages: [{ role: 'user', content: `Benchmark run ${run}.\n`
      + 'Write a Python module with 200 numbered, distinct functions and a test for each. '
      + 'Each function should validate and normalize one field of a fictional inventory record. '
      + 'Keep writing code until the output limit; do not summarize or abbreviate the implementation.\n'
      + Array.from({ length: 60 }, (_, i) => `Field ${i}: validate input, preserve valid values, reject invalid values.`).join('\n') }],
    temperature: 1, top_p: 0.95, top_k: 20, seed: 42,
    max_tokens: 1024, stream: false,
  };
}

export const median = values => {
  if (!values.length) throw new Error('No measurements');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export async function main([label, destination], env = process.env) {
  if (!label || !destination || !env.MODEL_BASE_URL || !env.MODEL_NAME) {
    throw new Error('Expected LABEL OUTPUT.json and MODEL_BASE_URL/MODEL_NAME');
  }
  const started = new Date().toISOString();
  const rows = [];
  for (let run = 0; run < 6; run++) {
    const body = request(env.MODEL_NAME, run);
    const clock = performance.now();
    const response = await fetch(`${env.MODEL_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        ...(env.MODEL_API_KEY ? { Authorization: `Bearer ${env.MODEL_API_KEY}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`Request ${run}: HTTP ${response.status}`);
    const value = await response.json();
    const seconds = (performance.now() - clock) / 1000;
    const usage = value.usage;
    if (!Number.isInteger(usage?.prompt_tokens) || !Number.isInteger(usage?.completion_tokens)
      || usage.completion_tokens < 1 || !value.choices?.[0]?.message) {
      throw new Error(`Request ${run}: missing usage or assistant message`);
    }
    const row = { run, warmup: run === 0,
      prompt_sha256: createHash('sha256').update(body.messages[0].content).digest('hex'),
      prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens,
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
      finish_reason: value.choices[0].finish_reason,
      request_seconds: seconds, inclusive_tokens_per_second: usage.completion_tokens / seconds };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  const measured = rows.filter(row => !row.warmup);
  const result = { label, started, finished: new Date().toISOString(),
    method: 'One warmup excluded, five sequential HTTP requests; inclusive timing includes prefill, transport and response parsing. Not decode-only throughput. Each user prompt starts with a different run number to limit prefix-cache reuse.',
    settings: { temperature: 1, top_p: 0.95, top_k: 20, seed: 42, max_tokens: 1024 },
    all_measured_replies_reached_limit: measured.every(row => row.finish_reason === 'length' && row.completion_tokens === 1024),
    median_inclusive_tokens_per_second: median(measured.map(row => row.inclusive_tokens_per_second)), rows };
  writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
