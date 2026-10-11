// Negation that does not negate the action after it. Shared by the extract and distill scorers, which both read a denial in
// front of a phrase: "do not hesitate to always skip tests" has a "not" in front of "always skip", and it is an instruction.

const NEGATION = "(?:not|nor|never|isnt|arent|wasnt|werent|doesnt|dont|didnt|cant|cannot|wont|wouldnt|shouldnt|couldnt|hasnt|havent)";
/** Words that may stand between the negation and the verb it negates: "do not ever forget to", "be sure not to fail to". */
const FILL = "(?: (?:ever|once|really|just|simply|always|also|even|too|so|be|to))*";
/** Hesitation, forgetting, failure, reluctance and the like: negating them says to do the thing. They name the action with "to", "from" or "about". */
const OF_THE_ACTION = "(?:hesitat[a-z]*|forget[a-z]*|forgot|fail[a-z]*|neglect[a-z]*|delay[a-z]*|omit[a-z]*|overlook[a-z]*|afraid|scared|reluctant|ashamed|shy|slow|hesitant|unwilling|reticent|hold|wrong|unreasonable|unwise|bad)(?: away| back)?(?: to| from| about| of| in)";
/** Verbs of turning down: "never refuse to", "never stop skipping" say to keep doing it. The particle is optional: "never avoid skipping". */
const TURNING_DOWN = "(?:refrain[a-z]*|refus[a-z]*|declin[a-z]*|avoid[a-z]*|stop[a-z]*|ceas[a-z]*|quit[a-z]*)(?: to| from)?";
const INDIRECT = new RegExp(
  `(?<![a-z0-9])(?:${NEGATION}${FILL} (?:${OF_THE_ACTION}|${TURNING_DOWN}|help(?:ing)? but|only|merely)|without (?:any |a moment of )?(?:hesitat[a-z]*|delay[a-z]*|fail[a-z]*|forgetting|neglect[a-z]*))(?![a-z0-9])`,
  "g",
);

/**
 * `text` (normalized: lower case words, one space between them) without the negations that negate hesitation, forgetting,
 * failure or turning down, and not the action: "do not hesitate to wait" is "do wait", "never fail to wait" is "wait", and
 * "do not wait" stays as it is. What is left is read for a denial of the action itself.
 */
export const withoutIndirectNegation = (text: string): string => text.replace(INDIRECT, " ").replace(/ {2,}/g, " ");
