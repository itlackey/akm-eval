// The one rule about negation that the extract and distill checks share. Each check looks for a phrase in a memory or a lesson and
// has to tell "do not skip tests" from "do not hesitate to skip tests", which says the opposite. Both ask this file which negations
// still stand, so the two cannot drift apart. Pure functions over normalized words (lower case, no punctuation, no apostrophes).
//
// The rule is small on purpose:
//   - A negation word governs the verb right after it. A few small words may stand between them ("do not ever", "never once", "try not to").
//   - A negating verb under a negation cancels it out. Hesitate, forget, fail, neglect, omit, refuse, decline, avoid, stop and cease are
//     such verbs, and so are afraid, reluctant and the like after "be", and wrong, bad and a mistake. "Do not hesitate to skip tests" and
//     "never fail to skip tests" tell the reader to skip them. The cancelling goes on down the chain: "never fail to avoid skipping tests" denies again.
//   - "No reason not to" and "why not" cancel in the same way.
//
// It reads words and where they stand, and not what a sentence means. A negation that governs a verb it does not list ("do not think
// we should skip tests") stands, and so does a double negation in words it does not list. Each check says in its README what that costs.

/** Words that may stand between a negation and the verb it governs, or between two verbs of the chain: "do not ever forget", "try not to", "not a mistake to", "no reason not to". */
export const FILLERS: ReadonlySet<string> = new Set(
  ("ever once again simply just really also even actually always truly still too so very to of than a an the be being been try trying bother need needs rely relying on " +
    "idea thing reason point harm problem risk cause excuse way doubt").split(" "),
);

/**
 * Verbs, and adjectives after "be", that deny what they govern, so that a negation that governs one of them is cancelled out. "Wrong",
 * "bad", "mistake" and the like are here for "it is not wrong to skip tests" and "not a mistake to": the evaluations that call the
 * act itself bad. "Good", "wise" and "safe" are not, because "not wise to skip tests" denies it.
 */
const CANCELS =
  /^(?:hesitat(?:e|es|ed|ing)|forg(?:et|ets|ot|otten|etting)|fail(?:s|ed|ing)?|neglect(?:s|ed|ing)?|omit(?:s|ted|ting)?|refus(?:e|es|ed|ing)|declin(?:e|es|ed|ing)|avoid(?:s|ed|ing)?|stop(?:s|ped|ping)?|ceas(?:e|es|ed|ing)|quit(?:s|ting)?|afraid|reluctant|hesitant|scared|ashamed|shy|loath|unwilling|wrong|bad|mistake|harmful|forbidden|prohibited|unsafe)$/;

/** Words that start a chain without denying anything themselves: "no reason not to skip tests" and "why not skip tests" turn the negation after them round. */
const OPENERS = new Set(["no", "why"]);

/** Says whether the word at `at` of `words` is a negation of the caller's: a word that denies what it governs. The caller reads the words after `at` to tell "instead of" from "instead". */
export type Negator = (words: string[], at: number) => boolean;

/** A negation and the chain under it. `at` is the index of its word. `end` is the index just after the last word of the chain: the negation and the negating verbs under it. `stands` is false when they cancel out. */
export interface Negation {
  at: number;
  end: number;
  stands: boolean;
}

/**
 * Every negation of `words`, left to right, with whether it still denies what comes after it. A negation governs the verb right after
 * it, and if that verb is itself a negating verb (or a negation of the caller's, such as "avoid"), the two cancel out, and the verb
 * after that one is read in turn: an odd number of them in a chain denies, an even number does not. The words that stand in a chain
 * are used up, so a negating verb is not counted again as a negation of its own.
 */
export function chains(words: string[], isNegator: Negator): Negation[] {
  const found: Negation[] = [];
  for (let at = 0; at < words.length; ) {
    const real = isNegator(words, at);
    if (!real && !OPENERS.has(words[at])) {
      at++;
      continue;
    }
    let parity = 1;
    let end = at + 1;
    for (let k = end; k < words.length; ) {
      if (CANCELS.test(words[k]) || isNegator(words, k)) {
        parity++;
        end = ++k;
      } else if (FILLERS.has(words[k])) {
        k++;
      } else {
        break;
      }
    }
    if (real) found.push({ at, end, stands: parity % 2 === 1 });
    at = end;
  }
  return found;
}

/** The negations of `words` that still deny what comes after them (see `chains`). The caller says where it looks: a window before a phrase, or only the words that `reaches` the phrase. */
export const negations = (words: string[], isNegator: Negator): Negation[] => chains(words, isNegator).filter((n) => n.stands);

/** Does the negation govern what comes next in `words`, with nothing but small words after its chain? It does when the words after it up to the end are all FILLERS. */
export const reaches = (words: string[], negation: Negation): boolean => words.slice(negation.end).every((w) => FILLERS.has(w));
