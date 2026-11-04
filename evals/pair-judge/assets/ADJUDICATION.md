# Adjudication

How the labels of `cases.jsonl` and `heldout/cases.jsonl` were made, what changed from consolidate's labels, and what a reviewer should read first. The rubric is the judge's own prompt (`README.md`, "Labels"). The label of an earlier eval is a starting point, not a label: consolidate's cases were labelled to score a whole consolidation (did akm retire a note that held a claim of its own), and this eval labels what the judge was asked.

## What was checked

For every case, in this order:

1. **The pair is one akm sends.** The pass judged it on a real run (`README.md`, "How the pairs were made") and `src/reachable.ts` still says so. The seven consolidate pairs it did not judge are in `retired.jsonl`.
2. **The sides follow the notes, not consolidate's `a` and `b`.** The pass puts the older note first, and with equal dates either; the cases are in the pass's order, and every label was carried over by note name (41 of the 73 pairs of consolidate's cases are in the other order, and their `safe`, `only_a` and `only_b` would be on the wrong side otherwise).
3. **Each claim is word for word in its note** and in no other note of the pair (`parseCases` refuses a case where it is not).
4. **The notes have no other difference.** Every sentence of one note was compared with the sentences of the other: a sentence with no counterpart that is not a labelled claim would be a claim the labels miss. There is none, except in a `lookalike` pair, where every sentence about the thing itself differs and all of them are labelled (consolidate labelled one sentence of each).
5. **A duplicate is a duplicate by the rubric.** Every pair of the 26 built as duplicates was read for a sentence that gives a specific (a number, name, path, who is paged) in one note and a vaguer one in the other: the rubric says a vaguer statement does not state the claim. Two pairs have one (below).
6. **Each rule of the rubric has its label.** A replaced value is in neither list and the new value is in the newer note's list (`supersedes`); equal dates and a different value are a conflict, each note's value is its own claim (`contradicts`); a vaguer note is the one that can go (`subsumed`); different named things never replace each other even when one note is newer (`lookalike`: 7 of the 10 have unequal dates).

## What changed from consolidate's labels

- **Sides** follow the pass's order (above).
- **`lookalike`** (consolidate's `unrelated` pairs that are paired, and the pool's `lookalike`): `only_a` and `only_b` hold every sentence that differs, not the one that decides.
- **`supersedes`**: consolidate labelled both claims of the pair; here the replaced value is dropped (the judge should not list it) and the new value is the newer note's claim.
- **Two pool pairs moved from `duplicate` to `subsumed`:** `pool-triple-02-2` and `pool-triple-02-3`. One note says a certificate with fewer than 7 days left "pages the on-call", the other that it "raises a page". By the rubric the second is the vaguer, so the first holds a claim (who is paged) the second lacks and only the second can go. Consolidate calls all three notes of the triple equivalent. See Review, item 1.
- **Seven pairs retired** and four hand-written cases added (`README.md`).

## Review

An independent second read, by Claude Opus on 2026-11-03, of all 112 cases (the 92 scored and the 20 held out) against the shipped prompt, `consolidate-pair.md` with the same-age and term-hint additions of `pair-pass.ts` (akm main `cc4872fe8`), before reading the labels above. For each case it read every sentence one note has and the other lacks, with the dates, and set `safe`, `only_a` and `only_b`.

**No label changed.** The independent read agreed with all 112. The calls below were the open ones; each is settled, with its evidence.

1. **`pool-triple-02-2` and `pool-triple-02-3`: `subsumed` stands.** The prompt: a claim "is not stated when the other asset is vaguer (a config file instead of the specific path)". "Raises a page" leaves out who is paged, as "a config file" leaves out which; "pages the on-call" names it. The labels are consistent with the triple's third pair (`pool-triple-02-1`, both notes say "raises a page": `duplicate`) and with `pool-duplicate-02` (both name the on-call: `duplicate`).
2. **A replacing claim belongs in the newer note's list: the `supersedes` labels stand (`subsumed`, `only_b` holds the new value, `a` safe).** The prompt defines `onlyInB` as "every durable claim of B that A does not state or replace". The new value is a claim of B; A does not state it, and A cannot replace it (B replaces A, only when B is current). The prompt's "Remove equivalent or replaced claims" removes A's replaced value, not B's new one. A judge that leaves `onlyInB` empty drops a claim B holds alone. The routes agree that it does not matter for harm: `decideRetirement` retires the older note on `duplicate` and on `subsumed` with `redundant` A alike, and only when `onlyInA` is empty, so `unsafe` and `found` are the same under either reading; and akm's own comment on the second look reads it this way ("a subsumed or superseding successor holds more by definition"). So a `duplicate` printed on a `supersedes` pair counts against `relation` and `claims` only, which is what they are for. The 19 cases keep their labels.
3. **`supersedes-10` and `supersedes-05`: replaced, `a` safe, stands.** `supersedes-10`: B's "Since version 1.5 a job no longer runs twice" states A's version-scoped claim in other wording (up to 1.4 it did: "no longer", "since 1.5"), and replaces its current value; `supersedes-05`: B names the old value itself ("the old minimum was 300 dpi"). Either way B keeps everything A says.
4. **`duplicate-09` and `pool-duplicate-02`: duplicates, stands.** "On arrival" in a description whose body says receivers check each request adds no fact; "the platform on-call engineer" and "the platform on-call" name the same rota.
5. **`lookalike` pairs with a later `b`:** not a call to settle, the harm the kind is for; the labels follow the prompt's "notes about different named things never replace each other, whatever their dates".
6. **Equal dates and the order of `a` and `b`: settled by a check.** The user message `akm judge consolidate.pair` builds from each case (dates moved as `src/reachable.ts` plants them) was compared byte for byte with the one the pass sent for that pair, on akm main `cc4872fe8` with a stub model: 112 of 112 identical, the 19 equal-date pairs included. So the cases are in the order this run of the pass gave them; the check still accepts either order for an equal-date pair, since another bundle could start from the other note.
7. **`contradicts-10`: stands,** `unmatchable` as above.

**The claim matcher** was changed in the review (scoring 0.1, before any published run): an item that quotes only the claim's identifier ("Node 22.3", "`plm pull`", "replica named reporting-ro") did not reach a third of the distinctive words of a `supersedes` claim, whose sentence also says what it replaced, and was counted `unlabelled`. An item now also states a claim when every word of it that the other note lacks is in the claim (`README.md`, "The claim matcher"). The smoke run's rows score the same.

## Held-out

The held-out part was adjudicated together with the rest, by the same checks. `README.md` lists its ids.
