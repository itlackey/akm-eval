# Judge-gate on the OpenCode harness with a minimal agent (#189)

`fast/qwen3.6-35b-a3b` (lab), thinking off, temperature 0, public corpus (188 cases), `--repeat 3`, one run at a time. akm origin/main
`88ec7f1b6` (`0.10.261105`) for both sides. Harness head `6b4e6be` with the experiment's change to `opencodeConfig` in `lib/judge.ts` (below; not kept in the eval). The #188 connection runs
are no longer on disk, so a connection set was run again on the same akm. The run folders were not kept: the agreement figures, kappa and
flipped cases are `scripts/compare` output from the time (`compare-connection-vs-harness.md`), and the summaries hold the pass counts.

## What changed

OpenCode 1.18.25 builds its system prompt from the agent's `prompt` when it has one, and from the provider default otherwise
(`LLMRequestPrep.prepare` in the binary: `[...agent.prompt ? [agent.prompt] : provider(model), ...system, ...user.system]`). The experiment gave
the agent akm runs (opencode 1's default, `build`) a one-line prompt and turned the title request off:

```ts
agent: { build: { temperature: 0, prompt: "Do the task in the message. Reply with exactly what it asks for." }, title: { disable: true } },
```

Verified with a logging proxy on the same cases:

| Request seen by the model server | Before | After |
|---|---|---|
| System prompt | 9,030 characters, "You are opencode…" | 459 characters (one line + opencode's environment block) |
| Prompt tokens, main call (2 cases) | 4,835 and 3,675 | 3,024 and 1,862 |
| Session-title request | one extra call per case (2.2k to 3.4k tokens) | none |

Mean over a 24-case sample after the change, through the proxy: 2,606 prompt tokens and 72.5 completion tokens a call, one request a case.

## Results

| | harness, default prompt (#189 issue, older akm) | harness, minimal agent | connection (same akm) |
|---|---|---|---|
| good passed (of 91) | 75 to 78 | 85.3 (mean; 84 to 86 by run) | 83.7 (mean) |
| bad passed (of 97) | 4 to 6 | 10.0 | 8.3 |
| harmful auto-accepted (of 64) | 1 to 3 | 5.7 | 4.0 |
| outcome agreement of runs with each other, per case | 88.8% to 90.4% | 89.4% to 92.0% | 98.4% to 99.5% |
| prompt tokens / call | about 5.6k | about 2.6k (24-case sample) | 3,228 |
| seconds / call (request) | about 10.6 | 6.4 | 3.8 |

Harness (minimal agent) against connection, majority outcome of three runs: 165 of 188 cases agree (87.8%), Cohen's kappa 0.794
(default-prompt harness against connection in #189: 81.6%, 0.694). `compare-connection-vs-harness.md` has the full table and the 23 flipped cases.

## Conclusion

The pass counts now match the connection's (good passed 85 against 84, bad passed 10 against 8), so the stricter judging of the harness came from
opencode's prompt and title request. Tokens a call fall by more than half (the 2.6k is a 24-case sample, not the connection's 188 cases, so it does not show the harness below the connection); time a call is still about 1.7 times the
connection's (opencode's session), and the harness is less steady between repeats than the connection. The gap that remains is agreement of 87.8%
(kappa 0.794) and a lab server that is not deterministic. Per the issue's Decision, the gap closed and tokens dropped, so this is the akm fix for
improve model work through OpenCode. On opencode 1, akm's model work runs `opencode run` with no `--agent` and no inline config, so opencode's
default agent `build` runs with the coding prompt and the title request (`agents."akm-model-work"` is opencode 2's key and is never selected on
1.18.25). On opencode 2, akm selects its `akm-model-work` agent, which has no `system` prompt, so opencode's default prompt is sent there too.
Follow-up to file on itlackey/akm. The eval keeps opencode's prompt so that it measures akm as it ships.
