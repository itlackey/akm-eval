import { describe, expect, test } from "bun:test";
import { claims as distillClaims } from "../evals/distill/src/lib.ts";
import { claims as extractClaims } from "../evals/extract/src/lib.ts";
import { type Negator, chains, negations, reaches } from "./negation.ts";

/** A small vocabulary of negators, as a check would pass: not, never, and "avoid". */
const negator: Negator = (words, at) => /^(?:not|never|dont|avoid|avoiding)$/.test(words[at]);
const words = (text: string): string[] => text.split(" ");
/** The words of `text` that still deny what comes after them. */
const standing = (text: string): string[] => negations(words(text), negator).map((n) => words(text)[n.at]);

describe("negations", () => {
  test("a negation governs the verb right after it, and stands", () => {
    expect(standing("do not")).toEqual(["not"]);
    expect(standing("never")).toEqual(["never"]);
    expect(standing("should not ever")).toEqual(["not"]);
    expect(standing("try not to")).toEqual(["not"]);
    expect(standing("the team")).toEqual([]);
  });

  test("a negating verb under a negation cancels it out: hesitate, forget, fail, neglect, omit, refuse, decline, stop", () => {
    for (const verb of ["hesitate", "hesitates", "hesitated", "hesitating", "forget", "forgot", "forgotten", "forgetting", "fail", "fails", "failed", "failing", "neglect", "omit", "omitted", "refuse", "refused", "decline", "declined", "stop", "stopped", "cease", "quit"]) {
      expect(standing(`do not ${verb} to`), verb).toEqual([]);
      expect(standing(`never ${verb} to`), verb).toEqual([]);
    }
  });

  test("so does a word that calls the act itself bad, and an adjective after 'be': not wrong, not a mistake, not afraid", () => {
    expect(standing("it is not wrong to")).toEqual([]);
    expect(standing("it is not a mistake to")).toEqual([]);
    expect(standing("it is not a bad idea to")).toEqual([]);
    expect(standing("do not be afraid to")).toEqual([]);
    expect(standing("never be reluctant to")).toEqual([]);
    // a word that approves of the act does not cancel: "not wise to" denies it
    expect(standing("it is not wise to")).toEqual(["not"]);
    expect(standing("it is not safe to")).toEqual(["not"]);
  });

  test("the cancelling goes on down the chain: an odd number of them denies, an even number does not", () => {
    expect(standing("never fail to avoid")).toEqual(["never"]);
    expect(standing("do not forget to avoid")).toEqual(["not"]);
    expect(standing("do not hesitate to not")).toEqual(["not"]); // the second one starts a chain of its own
    expect(standing("never fail to forget to")).toEqual(["never"]);
    expect(standing("do not avoid")).toEqual([]); // a negation of the caller's cancels too
    expect(standing("never avoid avoiding")).toEqual(["never"]);
  });

  test("a negating verb that nothing negates is not a negation of its own", () => {
    expect(standing("hesitate to")).toEqual([]);
    expect(standing("fail to")).toEqual([]);
    expect(standing("the failures")).toEqual([]);
  });

  test("a verb that is not listed ends the chain, so the negation stands: the documented approximation", () => {
    expect(standing("do not think we should")).toEqual(["not"]);
    expect(standing("do not hesitate to ask whether we should not")).toEqual(["not"]);
    expect(standing("do not rush to")).toEqual(["not"]);
  });

  test("no reason not to and why not cancel in the same way", () => {
    expect(standing("there is no reason not to")).toEqual([]);
    expect(standing("no need to avoid")).toEqual([]);
    expect(standing("why not")).toEqual([]);
    expect(standing("no matter what")).toEqual([]); // "no" and "why" alone deny nothing for a caller that does not list them
    expect(standing("why skip")).toEqual([]);
  });

  test("chains tell a cancelled negation from one that stands, and where each ends", () => {
    expect(chains(words("do not hesitate to"), negator)).toEqual([{ at: 1, end: 3, stands: false }]);
    expect(chains(words("never fail to avoid"), negator)).toEqual([{ at: 0, end: 4, stands: true }]);
    expect(chains(words("do not ask and never"), negator)).toEqual([
      { at: 1, end: 2, stands: true },
      { at: 4, end: 5, stands: true },
    ]);
  });

  test("reaches: the negation governs what comes next only when nothing but small words follow its chain", () => {
    const text = "do not ever";
    expect(reaches(words(text), negations(words(text), negator)[0])).toBe(true);
    const farther = "do not rely on networkidle but";
    expect(reaches(words(farther), negations(words(farther), negator)[0])).toBe(false);
    const hesitated = "never fail to try to";
    expect(reaches(words(hesitated), chains(words(hesitated), negator)[0])).toBe(true);
  });
});

/**
 * extract and distill each read a phrase against the words before it, with their own windows, but they decide what a negation denies with
 * this one rule. Each line has the same phrase after the same words in a sentence of each, and says whether the phrase is denied. If one
 * eval grows a rule of its own for a word, the line with that word fails.
 */
describe("extract and distill agree on what a negation denies", () => {
  const table: [lead: string, denied: boolean][] = [
    ["Do not", true],
    ["Never", true],
    ["Don't", true],
    ["You should not", true],
    ["Avoid", true],
    ["Try not to", true],
    ["Do not stop", false],
    ["Do not hesitate to", false],
    ["Don't forget to", false],
    ["Never fail to", false],
    ["Do not neglect to", false],
    ["Do not omit to", false],
    ["Do not refuse to", false],
    ["Do not decline to", false],
    ["Do not avoid", false],
    ["Do not be afraid to", false],
    ["Do not ever forget to", false],
    ["There is no reason not to", false],
    ["Why not", false],
    ["It is not wrong to", false],
    ["Never fail to avoid", true],
    ["Do not forget to never", true],
    ["Do not hesitate to not", true],
    ["Do not think we should", true], // a verb the rule does not list: the negation stands
  ];

  test("the same phrase after the same words is denied in both, or asserted in both", () => {
    const rows = table.map(([lead, denied]) => {
      const text = `${lead} wait for networkidle.`;
      return { lead, extract: extractClaims(text, [["wait for networkidle"]]).length === 0, distill: distillClaims(text, [["wait for networkidle"]], true).length === 0, denied };
    });
    expect(rows.map((r) => ({ lead: r.lead, extract: r.extract, distill: r.distill }))).toEqual(rows.map((r) => ({ lead: r.lead, extract: r.denied, distill: r.denied })));
  });
});
