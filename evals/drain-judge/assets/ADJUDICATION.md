# Adjudication log

How the labels of `cases.jsonl` and `heldout.jsonl` were set (rubric version 1), the readings of the prompt where it is silent, and what the adjudication changed. The rubric is in [README.md](README.md) ("Labels"). `../src/build.ts` writes the labels and their evidence; this page is the part that took judgment.

## Method

- **Labeller.** Claude Sonnet 5.5, on 2026-11-03, against the policy of the shipped judge: `buildJudgmentPrompt` in akm `src/commands/proposal/drain.ts` (akm main cc4872fe8), the promotion branch: its accept line, its reject line with "not durable", and "Reject the promotion if these notes already cover what it says, even in other words".
- **Adjudicator.** Claude Opus 5.5, on 2026-11-04, against the same prompt. Every source memory and every hand-written note was read in full, and each label was set independently before it was compared with the draft. The changes are under "Changes"; every doubt the draft left open is settled under "Settled".
- **Evidence.** `build.ts` computes the evidence in each `labelReason`:
  - good: the largest share of its five-word runs that any of the five nearest notes holds (under 10% for every good case), and whether its text has a state or retirement cue;
  - ephemeral: the state cues in the text (a date, `as of`, a branch, a commit hash, `N of M`, "not yet", "waiting", "pending", ...);
  - stale: the retirement cues (`retired`, `replaced`, `removed`, `dropped`, `no longer`, ...);
  - duplicate: that the knowledge note is among the five nearest (it is the nearest for all 58), how many of the memory's identifiers (code, numbers, paths) it holds, and the share of five-word runs it shares (at most 16%; at 30% the coverage gate would have skipped the promotion).
- **Labels by construction.** The hand-written cases are labelled by what they were written to be, and were read again as the judge reads them: the proposed content, its ref and the neighbours.
- **Reachability.** All 238 inputs were rebuilt by `src/reachable.ts` on akm cc4872fe8 and match. None is retired.

| | scored | held out | with `real` memory | with `corpus` memory | `hand-written` |
|---|---:|---:|---:|---:|---:|
| good | 45 | 12 | 18 | 39 | 0 |
| ephemeral | 49 | 16 | 1 | 6 | 58 |
| duplicate | 45 | 13 | 0 | 0 | 58 |
| stale | 45 | 13 | 0 | 0 | 58 |

A duplicate's promotion is a real or corpus memory; what makes it bad, the note it repeats, is hand-written, so it counts as hand-written. The targets (about 40 of each harmful kind, at least 20 good) are met in the scored part, but 135 of its 139 bad cases are hand-written: the real run and the corpora hold only 7 bad memories, and the real one is held out.

## Readings of the prompt

Where the prompt is silent or ambiguous, the same reading is applied to every case.

- **A promotion with a durable rule or finding that carries a date.** "The vendor switched the Amount column from cents to dollars on 2025-03-01" is a durable finding about data, not a state report: good. The prompt's "as of <date>" cue is for a state that changes, not for a date in a fact.
- **A rule learned in a session.** A convention the operator set ("never call chalk directly", "never run terraform apply") is durable: good, even when the memory tells it as what happened in the session ("the user explicitly corrected the agent").
- **A lesson drawn from an incident.** Durable (the prompt says so): good, whatever incident it records. A memory that describes the state of code with no lesson beyond "the fix is X", where the session made the fix, is not a lesson: it describes code that no longer exists.
- **A note about the retirement of a thing that is the subject of the rule.** "A battery is retired after 300 cycles" is a rule, not a retired approach: good. A note is stale only when the approach it describes is itself retired.
- **A status report.** Ephemeral: the prompt rejects a proposal that "reports the state of something that changes". The hand-written status reports state no lesson of their own.
- **A restated note.** Duplicate when the nearest note holds every claim "even in other words". The judge reads a note's description and the first 300 characters of its body, as the drain sends them; the label is about what the library holds, and a few notes lose their last sentence in the excerpt.
- **A retired note that names its replacement.** Stale, even when the replacement is not among the neighbours: the note itself says the approach is retired.
- **Trivial but durable.** A rota, a parking rule or a timetable is a correct, lasting rule that the people of that site look up. The prompt asks for a "valuable" update and lists no rejection for a small one, so these are good.
- **What `defer` earns.** No case has `defer` as its right answer. See README, "Labels".

## Changes

| Case | Was | Now | Evidence |
|---|---|---|---|
| `ephemeral-home-dev-quillmark-theme-resolution-behavior` (held out) | good | bad, ephemeral | The memory says `ResolveTheme` "lacks a fallback" and "the fix is to return themes[DefaultThemeName] instead", and its `evidence` is "Agent's fix at 2026-09-28". The session fixed it, so as knowledge it describes code that no longer behaves so, and it draws no general lesson. Its case was good-home-dev-quillmark-theme-resolution-behavior; the hand-written status report of its family is now `ephemeral-home-dev-quillmark-resolvetheme-fallback-fix-patch`. |
| the 116 hand-written status reports and retired notes, and the 58 notes the duplicates repeat | model-written (`constructed`) | written by hand (`hand-written`), labels kept | The model's notes were two to three times as long as real memories (600 to 1,135 characters against a median of about 450), corporate in style ("approved the initial phase rollout", "Current status: In Progress. Next milestone", "This note is retained for historical reference only"), carried a frontmatter `evidence` line that contradicted them, and were named `<memory>-status`, `<memory>-legacy` and `<memory>-reference`, so the judge could read the label off the ref. They were rewritten with the same defect, at 200 to 400 characters in the plain style of the memories next to them, with names made from their descriptions, and rebuilt through `build.ts`. |

The other 63 drafted labels of real and corpus memories stand.

## Settled

Each doubt the draft left open, with the reading that settles it.

| Case | Doubt | Settled |
|---|---|---|
| `good-harrow-coffee-rota`, `good-lindenhall-parking-rules`, `good-moorfield-onboarding-quiz`, `good-thornley-fire-drill`, `good-ulverston-wiki-style`, `good-ravenscar-podcast-gear`, `good-stanmore-library-loans`, `good-wetherby-courier-contract`, `good-northgate-invoice-archive`, `good-pinewood-label-printer`, `good-ivybridge-bike-store`, `good-juniper-translation-glossary`, `good-quarry-hill-sampling-plan`, `good-kestrel-drone-battery-care` | Durable but of little value | Good: "Trivial but durable" above. |
| `good-oldcastle-ferry-timetable`, `good-yewdale-trail-closures` | A timetable may be a state | Good: each gives the standing rules (departure times, the winter closure, the wind limit), with no date or "as of". |
| `good-home-dev-quillmark-registry-structure` | The shape of code written in a session | Good: a map of the code as it stands (a type, a method, a flag), not a status, branch, version or count, and none of the prompt's not-durable kinds. |
| good-home-dev-quillmark-theme-resolution-behavior (now `ephemeral-home-dev-quillmark-theme-resolution-behavior`) | A bug and its fix: knowledge or a change log | Changed to ephemeral (see Changes). |
| `good-home-dev-quillmark-test-failure-reporting-conven`, `good-home-dev-harborlight-docs-style-guide` | A convention told as what happened in a session | Good: "A rule learned in a session" above. |
| `good-ci-updated-snapshots-and-passed`, `good-kestrel-drone-battery-care`, `good-orders-index-migration-blocked-writes`, `good-release-tag-follow-tags-lightweight`, `good-renewed-cert-not-served-until-reload`, `good-home-dev-ledgerline-terraform-workflow`, `good-home-dev-harborlight-commit-convention`, `good-apprise-matrix-room-hash-encoding`, `good-rsync-backup-nested-site-folder`, `good-reset-emails-spam-missing-spf-include` | `build.ts` flags a state or retirement word ("no longer", "blocked", "dropped", "ended", a date) | Good: each word is part of the incident or the rule, not a report of state. |
| `ephemeral-nightly-e2e-run-2026-09-18`, `ephemeral-preview-server-upgrade-2026-09-03` | Dated event logs with few cues | Ephemeral: a test count and a version on a date, which the prompt names. |
| `ephemeral-node-18-support-decision-pending` | An open question that also holds the 11% install figure | Ephemeral: the note is about a decision not yet made, and the figure is of the last 30 days. |
| `ephemeral-sprint-41-retro-notes` | A retro with one lasting decision | Ephemeral: a sprint's velocity and carry-over on a date; the one decision (planning on Tuesdays) is a plan from sprint 42 on, which the prompt also rejects. |
| the model's status reports | Each also restated part of its source's lesson | Moot: rewritten; the hand-written status reports state no lesson. |
| `duplicate-home-dev-harborlight-cli-error-formatting` | `build.ts` finds 2 of 5 identifiers in the note | Duplicate: the note gives the prefix, `fail(message, code)` in `src/util/tty.ts`, exit 1 at runtime, and `configureOutput` and `exitOverride` with what they do, in words where the memory gives code. |
| the model's retired notes | Invented retirement dates and replacements, unverifiable | Stale on the note's own word, as before: the judge can only read that the note says so, and the prompt rejects what "describes something already retired, replaced or superseded". |

## Open

Nothing is open.
