# Judge-gate on the OpenCode harness with akm's model-work agent (akm#1426)

akm#1426 gives the agent akm runs OpenCode model work as (`akm-model-work`) a one-line system prompt, and on OpenCode 1 selects that agent
and a session title (`--agent akm-model-work --title akm`, an inline `OPENCODE_CONFIG_CONTENT` with the prompt in the singular `agent` map).
This is the measurement the issue asks for, on `fast/qwen3.6-35b-a3b` (lab), thinking off, temperature 0, public corpus (188 cases),
`--repeat 3`, one run at a time, `--model fast/qwen3.6-35b-a3b` passed explicitly (every summary records that model).

| Label | akm | Runner |
|---|---|---|
| `pr-harness` | akm PR branch `fix/1426-model-work-agent` (`d4e64dfae`, `0.10.261105`) | `--harness opencode` (opencode 1.18.25) |
| `pr-conn` | the same akm | connection |
| `main-harness` | akm origin/main `88ec7f1b6` (`0.10.261105`) | `--harness opencode` (opencode 1.18.25) |

akm ran from each checkout (`bun src/cli.ts`, `--akm`); judge-gate needs no embedding. The eval head is `fda9867` plus one change in
`lib/judge.ts`: the harness judge's opencode config sets `temperature: 0` on `akm-model-work` as well as on `build`. Without it the new agent
would run at opencode's default for the model (0.55 for Qwen models), and the runs would differ by sampling and not by the prompt. A logging proxy
between the runs and the lab gateway (`proxy/proxy.mjs`, forwarding unchanged) recorded every request; `proxy/seg.mjs` splits its log by system
prompt (`proxy/proxy-stats.txt`). The proxy logged all three runs in one file because the first proxy outlived its run (a wrapper pid was killed,
not node); the three kinds of request are told apart by their system prompt, so nothing is mixed.

## Results

Means over three runs, range in brackets. `scripts/compare` agreement is the majority outcome of the three runs on each side (188 cases).

| | main akm, harness | PR akm, harness | PR akm, connection |
|---|---|---|---|
| good passed (of 91) | 75.3 (72 to 79) | 85.3 (85 to 86) | 82.7 (82 to 83) |
| bad passed (of 97) | 4.7 (4 to 5) | 11.3 (10 to 13) | 8.0 (8 to 8) |
| harmful auto-accepted (of 64) | 1.7 (1 to 2) | 6.7 (6 to 8) | 4.0 (4 to 4) |
| majority-outcome agreement with the connection | 82.7% (153 of 185; kappa 0.719; 3 cases with no majority) | **89.4%** (168 of 188; kappa **0.823**) | |
| agreement of PR harness with main harness | | 84.9% (kappa 0.750) | |
| system prompt sent | 8,911 characters, "You are opencode…" | 447 characters (the akm line + opencode's environment block) | 33 characters |
| session-title requests | 634 (one a case, plus retries; 53 completion tokens, 3.7k prompt tokens each) | **0** | 0 |
| prompt tokens / call (proxy, main call) | 5,573 | **3,766** | 3,228 |
| completion tokens / call | 78 | 78 | 70 |
| seconds / call (akm, model request) | 10.5 | **6.3** | 3.8 |
| seconds / case | 11.3 | 7.1 | 4.1 |
| errored cases, timeouts | 0, 0 | 0, 0 | 0, 0 |
| temperature seen by the server | 0 (title 0.5) | 0 | 0 |

Per run (good / bad / harmful auto-accepted): main harness 79/5/1, 75/5/2, 72/4/2; PR harness 85/10/6, 86/11/6, 85/13/8; PR connection 83/8/4, 82/8/4, 83/8/4.

## Reading

- The fix does what the issue says on the wire: with akm's change the model sees akm's one-line prompt and no title request, every call (567 of
  567 requests have the 447-character system prompt; none is a title request), where main sends opencode's 8,911-character coding prompt and
  a title request each case. Tokens a call fall by a third (5,573 to 3,766), and the title request, which main made on top, is gone; seconds a call fall from 10.5 to 6.3.
- The judge is no longer stricter than the connection's: good passed 85.3 against 82.7, bad passed 11.3 against 8.0, harmful auto-accepted 6.7
  against 4.0. Main sat the other way (75.3, 4.7, 1.7). Agreement with the connection rises from 82.7% (kappa 0.719) to 89.4% (kappa 0.823).
- **The acceptance "pass counts within the connection's repeat spread" is not met strictly.** The connection's three runs agree to the case (good 82 to 83, bad 8, harmful 4), a
  spread of about nothing, and the harness runs sit 2 to 4 cases above on each: good +2.7, bad +3.3, harmful +2.7 on the mean. That is about two to
  three cases of 91 or 97 (judge-gate's README: a gap of a case or two is noise; one case is 1.1 points of `good`, 1.6 of `harmful_auto_accepted`),
  the harness's own runs spread wider (bad 10 to 13) than the connection's, and the lab server is not deterministic. It is the same result
  as the experiment in `reports/judge-harness-minimal-agent-2026-11-04` (85.3 / 10.0 / 5.7 against 83.7 / 8.3 / 4.0) now produced by akm as it
  ships. The harness is slightly more lenient than the connection where main was much stricter. What remains is not opencode's prompt: akm's own
  instructions reach the model inside the user message on the harness (`<AKM_CONVERSATION_JSON>`, `harness.systemPrompt = false`) and as a system message on a connection.
- 1.7 times the connection's seconds a call remain (opencode's session), as in #190. The prompt tokens a call remain 538 above the connection's.

## What was checked in opencode (installed 1.18.25 and 2.2.5, a stub model endpoint that logs each request, sandboxed HOME)

| Claim in the issue | Result |
|---|---|
| opencode 1.18.25 honours `run --agent`, `run --title` and `OPENCODE_CONFIG_CONTENT` | confirmed; `> akm-model-work · fast` is the agent the run reports |
| opencode 1 reads the singular `agent` map and `prompt`, and replaces its provider prompt with it | confirmed; the same prompt on the plural `agents` key is ignored (opencode's default prompt is sent) |
| without `--agent` and `--title`, opencode 1 runs `build` and makes a title request | confirmed: two requests, a 2,096-character "You are a title generator" and the 26,637-character coding prompt (on this machine it holds the skills listing as well; the eval sandbox hides those) |
| with them, one request, the agent's prompt first, then opencode's environment block | confirmed (1 request); tools stay (bash, edit, read, …): opencode 1 cannot be restricted, and the warning stays |
| opencode 2 sends `[agent.system, environment]` and an agent without `system` gets opencode's default prompt | confirmed on 2.2.5: with `system` the request is 829 characters starting with akm's line, tools `glob`, `grep`, `read`, one request; without it opencode's default 1,496-character "You are an AI agent running in OpenCode" |
| a `prompt` on `agents.<name>` does nothing on opencode 2 | confirmed on 2.2.5 (default prompt still sent) |

Not run: opencode 2 through the judge-gate eval (the eval's harness config is opencode 1 only, `lib/judge.ts`; its note in `private/ISSUES.md`).
One thing the issue did not say: on opencode 1 the environment block is followed, on a machine with Claude Code skills in `~/.claude`, by opencode's
`skill` listing (about 17k characters here), because the unrestricted agent keeps the `skill` tool. The eval turns Claude Code files off, so it does not show in these runs; it does in a user's real model work.

## Files

- `judge-gate/`: the nine run folders (`summary.json`, `samples.jsonl`) and the three `*-repeat-summary.json`.
- `pr-conn-vs-pr-harness.md`, `pr-conn-vs-main-harness.md`, `main-harness-vs-pr-harness.md`: `scripts/compare` output with the flipped cases.
- `proxy/`: the logging proxy, the script that splits its log, the statistics above and the system prompt the PR sent (`system-pr-harness.txt`).
