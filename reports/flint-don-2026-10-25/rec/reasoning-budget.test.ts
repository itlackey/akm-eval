import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { bakeoffConfig } from '../../../evals/bakeoff/src/collect.ts';
import { deepMerge } from '../../../lib/akm/overrides.ts';

const patch = JSON.parse(readFileSync(new URL('./reasoning-budget.json', import.meta.url), 'utf8'));

test('reasoning-budget profile explicitly requests the complete output budget and publisher sampling', () => {
  expect(patch).toEqual({ engines: { bakeoff: {
    temperature: 1, enableThinking: true,
    extraParams: { top_p: 0.95, top_k: 20, max_completion_tokens: 32768 },
  } } });
});

test('profile changes no task strategy, timeout, endpoint, identity or experimental setting', () => {
  const base = bakeoffConfig('http://model.invalid/v1', 'flint', true);
  const merged = deepMerge(base, patch) as typeof base;
  expect(merged.improve).toEqual(base.improve);
  expect(merged.experimental).toEqual(base.experimental);
  expect(merged.defaults).toEqual(base.defaults);
  const { temperature: _t, enableThinking: _thinking, extraParams: _extras, ...engine } = merged.engines.bakeoff;
  const { temperature: _bt, enableThinking: _bthinking, ...original } = base.engines.bakeoff;
  expect(engine).toEqual(original);
  expect(base.engines.bakeoff.enableThinking).toBe(false);
});
