# akm-eval — Status, Gaps, and Definition of Done

This document captures where `akm-eval` is today, what it's missing relative to its strategic role, and what "done" looks like for the v1.0 of the repo. Companion document: [akm-bench-status.md](./akm-bench-status.md).

## Strategic role

`akm-eval` is the **credibility floor**. Its job is to wrap public, third-party benchmarks with the same harnesses everyone else uses. Same model, same dataset, same judge, and normalized outputs. Baseline-vs-AKM comparison claims stay blocked until this repo has a real evaluated AKM execution path instead of the current stub backend.

`akm-eval` is explicitly **not** a place for novel benchmarks, akm-internal measurements, or attribution analysis. Those live in `akm-bench`.

---

## Gap Analysis

### Current state

**Built and shipped:**
- TypeScript/Bun project, CLI at `src/cli.ts`
- "No synthetic fallbacks" trust policy enforced at the framework level — packs must fail clearly when their official harness isn't wired
- Variant system (`variants[].akm.configPath`) for future baseline-vs-akm A/B once a real AKM execution path exists
- Dataset auto-download via `bun run download:datasets`
- `doctor` command for environment validation
- `check:boundary` script for architectural enforcement
- `list`, `matrix`, `compare`, and per-run `report` CLI commands
- OpenAI-compatible runner support alongside opencode
- Biome linting and test infrastructure

**Packs wired:**
- LongMemEval (memory family)
- LoCoMo (memory family)
- BEAM (memory family, via vendored `mohammadtavakoli78/BEAM`)
- Terminal-Bench (tool-use family, via official `tb` harness)
- SWE-Bench Verified (software-engineering family, via official `swebench` harness)
- `akm-bench` stub present but intentionally blocked until it is backed by authoritative external harness/result artifacts

**Repository status:**
- `runs/reference/` now contains committed reference artifacts for baseline runs such as LoCoMo, LongMemEval, Terminal-Bench, SWE-Bench Verified, and `tau-bench`
- MPL-2.0 license
- opencode remains the best-supported runner path, but it is no longer the only supported runner

### Strategic gaps

These are the gaps between current state and the strategic role akm-eval plays. Closing these is what moves the repo from "scaffolding" to "the credibility floor is in place."

**1. The benchmark mix is still memory-heavy, even after adding SWE-Bench.**

Three of five runnable packs measure long-conversation memory recall. Wiring SWE-Bench Verified closed the biggest credibility hole, but akm's actual pitch is still broader than memory recall. The remaining missing packs that would better showcase that pitch are:

- **GAIA** — multi-step general agent tasks with tool use, cheaper to run than SWE-Bench
- **τ-bench** — multi-turn tool use, retail and airline domains

Until at least one non-memory general-agent pack is wired, akm-eval still reads disproportionately as "we measured akm on memory benchmarks plus SWE-Bench," which sets reviewers up to ask whether the benchmark mix really matches the product pitch.

**2. Reference results exist, but coverage is still uneven.**

The repo now has committed reference artifacts for several packs, so it no longer reads as pure scaffolding. The remaining gap is complete coverage of all claimed v1 benchmark paths, especially BEAM.

**3. Runner support is broader in principle than in practice.**

The repo now has both `opencode` and `openai-compatible` runners. That closes the most literal version of the gap, but support is still uneven across packs: `terminal-bench` remains opencode-only in this repo because the official harness integration depends on the opencode installed agent path. The benchmark story is therefore less coupled than before, but not yet uniformly runner-agnostic.

### Tactical gaps

Smaller polish items that don't change the strategic position but reduce friction:

- Normalized result handling exists across packs, but the schema contract is still too thin. Different upstream harnesses produce different output shapes, and the current doc is not yet strong enough to serve as a stable per-pack JSON spec.
- Result normalization exists and the public schema doc is now substantially stronger, but per-pack reproduction metadata expectations are still not enforced uniformly.
- Cross-run aggregation now exists via `akm-eval summary`, but the top-level README still needs to keep its published reference table aligned with regenerated artifacts.
- CI smoke test exists on a weekly cadence, but the smoke environment is still only lightly pinned rather than fully containerized.
- MPL-2.0 license is uncommon for eval frameworks. LongMemEval, LoCoMo, mem0's eval, and SWE-Bench are all Apache 2.0 or MIT. Companies that might run akm-eval against their stack and publish comparisons are friction'd by weak copyleft. Worth a deliberate yes/no rather than inheriting from akm.

### Cross-repo gaps (shared with akm-bench)

- No published AKM comparison reference results in either repo
- partial runner coupling in both
- Same MPL-2.0 license question

### Priority order

1. Finish BEAM's pinned evaluator runtime so its reference run is reproducible end-to-end
2. Replace the stub `akm` backend with a real evaluated path before claiming cross-pack baseline-vs-AKM comparisons
3. Remove pack-level runner coupling where feasible, especially for non-opencode paths
4. Re-evaluate license

---

## Definition of Done

akm-eval is "done" — meaning it can shift from active development to maintenance — when an outsider can land on the repo, run a single command, and reproduce a published number on each benchmark family it covers.

### Required packs

By family:

| Family | Required packs | Status |
|---|---|---|
| Memory | LoCoMo, LongMemEval, BEAM | LoCoMo and LongMemEval wired with reference artifacts; BEAM blocked on upstream evaluator runtime |
| Tool use | Terminal-Bench, τ-bench | Wired ✅ |
| Software engineering | SWE-Bench Verified | Wired with reference artifact ✅ |
| General agent | GAIA | Stretch goal |

A v1.0 with LoCoMo + LongMemEval + Terminal-Bench + SWE-Bench Verified + `τ-bench` is now structurally possible. BEAM remains blocked until the repo ships a pinned runtime that can run the upstream evaluator end-to-end. GAIA remains the main strategic expansion target beyond that.

### Required infrastructure

- At least two agent runners supported: opencode (current default) + one of {Claude Code, generic OpenAI-compatible adapter}
- Pack coverage for those runners documented explicitly, so "supported" does not overstate packs that are still runner-specific
- Normalized result schema across packs, documented in `docs/result-schema.md`
- Cross-run reporting command producing a markdown summary across runs in `runs/`
- CI smoke test on a cheap model, weekly cadence, smallest pack
- Reproducible container image or equivalent pinned execution environment for any pack whose official upstream evaluator requires a heavy or fragile runtime stack

### Required documentation

- Operator guide (running benchmarks locally and in CI) — currently split across `docs/running-evals.md`, `docs/benchmark-packs.md`, and `README.md`; should be consolidated or clearly linked
- Contributor guide (adding a new pack, with the pack contract and trust policy compliance checklist) — `docs/contributing.md`
- Per-pack README in each `src/packs/<name>/` directory documenting the third-party harness, the pinned version, and any vendor checkout requirements
- Top-level README with current cross-pack reference table

### Required published results

- One full reference run per pack that is claimed as v1-ready, with model + config + commit SHA + date, checked into `runs/reference/<pack>/`
- Cross-pack reference table documented in the top-level README — table listing each published run with pack, variant, model, score, commit SHA, date, and artifact link
- For packs with a real AKM execution path, baseline and AKM reference results are regenerated and committed when a new AKM version moves the score by more than 2 percentage points. This remains future work while `src/memory/backends/akm.ts` is still a stub.

### Quality gates

- All packs respect the trust policy. No synthetic fallback, fail clearly when official harness is unavailable. Verified by `check:boundary`.
- Dataset downloads are reproducible: versioned URLs or pinned snapshots, never "latest"
- A baseline run on any published reference pack is reproducible from pinned inputs and a documented runtime environment
- CI must pass on every PR, including the trust-policy boundary check

### Non-goals (explicit)

These are things akm-eval will *not* do, on purpose. Documenting non-goals matters as much as documenting goals — it prevents scope drift and makes contribution decisions easier.

- **Will not implement memory systems, retrieval algorithms, or agent loops.** akm-eval wraps third-party harnesses; that is the entire job. Anyone who wants to compare retrieval algorithms inside akm should use akm-bench.
- **Will not invent new benchmarks.** New benchmarks live in akm-bench. If a benchmark doesn't exist publicly with a citable harness, it doesn't belong in akm-eval.
- **Will not measure akm's internal behavior.** Which assets fired, why, in what order — that's `akm-bench attribute`. akm-eval treats akm as a black box.
- **Will not become a hosted leaderboard or dashboard.** Results are reproducible JSON in a git repo. Rendering, ranking, and presentation are explicitly somebody else's problem.
- **Will not optimize for akm's scores.** The trust policy exists because the temptation to silently tune the harness in akm's favor is real. Every pack runs the upstream protocol verbatim, including its judge prompts and grading code.

### Out of scope for v1.0

These are valuable but explicitly deferred past v1.0:

- More than two agent runners
- A web UI for browsing results
- Real-time / streaming benchmark output
- Cost / token accounting (LiteLLM proxy logs are a workaround until then)
- Parallel pack execution across multiple machines

---

## Agent Review Consensus and Minimal Implementation Plan

This section captures the shared conclusion from a multi-agent critical review of the current repository state and the definition of done above. The consensus is that `akm-eval` is much closer to credibility than the empty `runs/` directory suggests, but the remaining work is mostly evidence, documentation, and precise support boundaries rather than major framework construction.

### Critical review conclusions

- The core harness is already real: the CLI, trust-policy boundary, pack adapters, normalized results, `compare`, and per-run `report` all exist.
- The repo is not opencode-only anymore. It has both `opencode` and `openai-compatible` runners, but support is uneven by pack and must be documented pack-by-pack.
- `swe-bench` is wired through the official harness. The committed OpenAI-compatible smoke/reference path now targets SWE-Bench Verified, while the opencode smoke path still targets Lite; docs must keep that split explicit instead of collapsing it into a single repo-wide default claim.
- The repo now has baseline reference artifacts and no longer reads like pure scaffolding.
- Cross-run aggregation, containerization, and benchmark expansion are all secondary to publishing evidence from the packs that already work.
- Two hard blockers remain outside pure documentation work: BEAM still lacks a pinned evaluator runtime in this repo, and the `akm` memory backend is still a stub, so published baseline-vs-AKM comparison tables would currently overclaim what is implemented.
- The current definition of done is directionally correct, but the practical bar is reproducible score-level results with pinned inputs and clearly documented prerequisites, not literal one-command setup or bit-for-bit output identity.

### How to interpret the definition of done

- Treat the current v1.0-ready pack set as LoCoMo, LongMemEval, Terminal-Bench, SWE-Bench Verified, and `τ-bench`.
- Treat BEAM as wired-but-runtime-blocked until its upstream evaluator environment is pinned and reproducible in this repo.
- Treat `GAIA` and `τ-bench` as expansion targets, not blockers for declaring a credible first release.
- Treat runner support as a per-pack support matrix, not a repo-wide blanket claim.
- Treat result-schema completion as documentation hardening of an existing implementation, not as invention of a new subsystem.
- Treat CI for v1.0 as boundary checks, tests, and one cheap automated smoke path, not exhaustive benchmark automation.
- Treat containerization as optional for v1.0 unless it becomes the simplest way to make reproduction reliable.
- Treat baseline-vs-AKM published comparisons as blocked until the repo has a non-stub AKM execution path in evaluated packs. The current `src/memory/backends/akm.ts` backend is only a stub.

### Consensus principles

1. Publish proof before expanding scope.
2. Preserve the trust policy without exceptions.
3. Prefer documentation and artifact completion over new abstractions.
4. Add at most one new benchmark pack after reference evidence exists.
5. Make support claims precise and narrow.

### Minimal implementation plan

1. Publish reference results for the packs that are already wired.
Create one checked-in reference run for each current benchmark family anchor: one memory pack, `terminal-bench`, and `swe-bench`. Store them under `runs/reference/<pack>/` with model, runner, config, repo commit, benchmark source/version, and date.

2. Make the repo visibly reproducible.
Add a top-level README table listing each published reference result, its score, and the command or config used to reproduce it. Link directly to the committed artifacts.

3. Tighten the documentation contract.
Expand `docs/result-schema.md` so it documents the normalized artifact set and core fields as a stable public contract. Rewrite stale per-pack READMEs so each one states the upstream harness, pinned source, required local dependencies, runner limitations, and vendor checkout expectations.

4. Document support boundaries explicitly.
Add one runner-support table covering each shipped pack and whether it supports `opencode`, `openai-compatible`, or both. This keeps the repo honest about where support is real and where it is still partial.

5. Add the cheapest useful automation.
Add GitHub Actions for `bun test` and `bun run check:boundary` on every PR, plus one scheduled smoke run for the smallest cheap benchmark path. Do not block on full benchmark automation.

6. Only then expand the benchmark mix.
After the published reference runs and docs are in place, add exactly one non-memory expansion pack. Prefer `GAIA` if its official harness path is straightforward; otherwise use `τ-bench`. Do not add both before the first release is already credible.

Phase 6 result: `τ-bench` was the easier official-harness integration in this repo and has now been wired with a real reference artifact under `runs/reference/tau-bench/baseline`.

### Explicit anti-plan

- Do not build new reporting infrastructure before publishing reference runs.
- Do not add multiple new packs in parallel.
- Do not require full containerization before the repo has reference evidence.
- Do not promise runner portability that the current pack implementations do not actually deliver.
- Do not weaken the trust policy for smoke tests, convenience flows, or faster demos.

### Simplest path if the team does only one thing at a time

The simplest path is:

1. Run one memory pack, `terminal-bench`, and `swe-bench` for baseline reference coverage.
2. Commit the resulting normalized artifacts under `runs/reference/`.
3. Add a small README score table that links to those artifacts and the configs that produced them.

If those three steps are completed, `akm-eval` stops looking like an eval harness in progress and starts looking like the credibility floor it is meant to be.

### Documentation note

Until real reference artifacts exist, the repo should use `pending` placeholders rather than example benchmark numbers. Example scores would undermine the central claim that `akm-eval` is credible because it reports only authoritative third-party benchmark outcomes.
