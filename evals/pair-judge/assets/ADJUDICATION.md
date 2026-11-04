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
- **Two pool pairs moved from `duplicate` to `subsumed`:** `pool-triple-02-2` and `pool-triple-02-3`. One note says a certificate with fewer than 7 days left "pages the on-call", the other that it "raises a page". By the rubric the second is the vaguer, so the first holds a claim (who is paged) the second lacks and only the second can go. Consolidate calls all three notes of the triple equivalent. See Open.
- **Seven pairs retired** and four hand-written cases added (`README.md`).

## Open

The labels a reviewer should read first. Each is a call, with the reading that was not taken.

1. **`pool-triple-02-2` and `pool-triple-02-3`** (above). Taken: "raises a page" is vaguer than "pages the on-call", so the note that says it is `safe` and the other holds the claim (`subsumed`). Not taken: both say a page is raised for a short certificate, and a page goes to the on-call by the name, so they are duplicates (`pool-triple-02-1`, the pair that says the same in both notes, is). It changes `safe` of two cases and their relation.
2. **A replacing claim in the newer note's list.** For `supersedes` the labels put the new value in `only_b` (A does not state it), so the pair is `subsumed` and the older note can go. The prompt tells the judge to remove replaced claims from the lists, and does not say whether the claim that replaces is one. A judge that lists nothing for either note prints `duplicate` and retires the older note too: the same retirement as the label, with a different relation, so `relation` counts it wrong and `found` and `unsafe` do not. In the 10-case smoke the 35B model did that on both `supersedes` cases. If the owner reads the prompt the other way, the relation of the 19 `supersedes` cases is `duplicate` and `only_b` is empty; the retirement stays the same.
3. **`supersedes-10` and `supersedes-05`** (held out): the replaced claim is version-scoped ("up to version 1.4 a job can run twice"; "the old minimum was 300 dpi") and the newer note says "since 1.5 ... no longer". A strict reader keeps the old claim as a claim of the older note, which it still holds for the versions it names. Taken: replaced, as the prompt's own examples (`since`, `no longer`) are.
4. **A duplicate with a trivial qualifier:** `duplicate-09` (the description of one note ends "on arrival"), `pool-duplicate-02` ("the platform on-call engineer" and "the platform on-call"). Taken: no claim; wording. A strict judge may list the qualifier.
5. **`lookalike` pairs with a later `b`** (7 of 10): the newer note is not a replacement because the notes are about different named things (the Team and the Business plan, the core and the cli package). A judge that reads "later" as "replaces" retires the older note, which holds a claim of its own: this is the harm the kind is for.
6. **Equal dates and the order of `a` and `b`.** With equal dates the pass puts the note it started from first, so a case's `a` could have been `b`. The check accepts either order for those 19 cases; the labels do not depend on it.
7. **`contradicts-10`** (held out): the two claims differ in word order only, so the matcher cannot tell them apart (`unmatchable`). The label stands.

## Held-out

The held-out part was adjudicated together with the rest, by the same checks. `README.md` lists its ids.
