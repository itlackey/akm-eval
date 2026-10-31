// The prompts. The reader prompt is the same for both arms. Only the sessions in it differ.
// The judge prompts are the benchmark's own, one per question type, copied exactly. They belong to the collector (collect.ts): what the
// judge is sent decides its verdict, and a verdict is a model call. Reading a verdict is the scorer's (score.ts).

export interface Turn {
  role: string;
  content: string;
}

export interface SessionView {
  date: string;
  turns: Turn[];
}

/**
 * The answer a reader gave, without its reasoning: what the judge is sent. A model that thinks first writes the thinking in a block
 * (`<think>...</think>`, and the `thinking`, `thought` and `reasoning` forms of it), and the judge must grade the answer and not the
 * candidates it weighed on the way. A block that never closes was cut off (the reply stopped at the token limit inside it), so it runs to
 * the end of the reply; a closing tag with no opening one before it ends reasoning that began in the prompt (some templates put the opening
 * tag there), so it takes everything before it. What is left is trimmed, and is empty when the reply was only reasoning.
 */
export function stripReasoning(reply: string): string {
  return reply
    .replace(/<(think|thinking|thought|reasoning)>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(?:think|thinking|thought|reasoning)>[\s\S]*$/i, "")
    .replace(/^[\s\S]*<\/(?:think|thinking|thought|reasoning)>/i, "")
    .trim();
}

export const renderSession = (s: SessionView, n: number): string => `### Session ${n}\nSession Date: ${s.date}\n${s.turns.map((t) => `${t.role}: ${t.content}`).join("\n")}`;

/** The reader's instruction, the benchmark's own. memory-utility's LongMemEval cases send the same one. */
export const READER_INSTRUCTION = "I will give you several history chats between you and a user. Please answer the question based on the relevant chat history. Answer concisely. If the chat history does not hold the information needed, say that you do not know.";

/** The question and the chats the model may use: every session of the haystack, or the ones akm returned. */
export function readerPrompt(sessions: SessionView[], questionDate: string, question: string): string {
  const history = sessions.length > 0 ? sessions.map((s, i) => renderSession(s, i + 1)).join("\n\n") : "(there are no chats)";
  return [
    READER_INSTRUCTION,
    "",
    "History Chats:",
    "",
    history,
    "",
    `Current Date: ${questionDate}`,
    `Question: ${question}`,
    "Answer:",
  ].join("\n");
}

// The judge prompts, copied exactly from get_anscheck_prompt in src/evaluation/evaluate_qa.py of
// github.com/xiaowu0162/LongMemEval (checked against its main branch on 2026-10-05). The spaces before the
// blank lines in the first two are the benchmark's own.
const ANSWER_FOR_CORRECT = "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. ";
const OFF_BY_ONE = "In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct. ";

/** The benchmark's rule for an abstention question, from evaluate_qa.py: "_abs" is somewhere in the question id. It decides which judge prompt a question gets, so it is the collector's; the scorer has the same rule for the retrieval means (score.ts). */
export const isAbstentionQuestion = (questionId: string): boolean => questionId.includes("_abs");

export function judgePrompt(questionType: string, question: string, answer: string, response: string, abstention: boolean): string {
  const tail = (label: string, closing: string) => `\n\nQuestion: ${question}\n\n${label}: ${answer}\n\nModel Response: ${response}\n\n${closing}`;
  if (abstention) {
    return `I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.${tail("Explanation", "Does the model correctly identify the question as unanswerable? Answer yes or no only.")}`;
  }
  const closing = "Is the model response correct? Answer yes or no only.";
  switch (questionType) {
    case "single-session-user":
    case "single-session-assistant":
    case "multi-session":
      return `${ANSWER_FOR_CORRECT}${tail("Correct Answer", closing)}`;
    case "temporal-reasoning":
      return `${ANSWER_FOR_CORRECT}${OFF_BY_ONE}${tail("Correct Answer", closing)}`;
    case "knowledge-update":
      return `I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.${tail("Correct Answer", closing)}`;
    case "single-session-preference":
      return `I will give you a question, a rubric for desired personalized response, and a response from a model. Please answer yes if the response satisfies the desired response. Otherwise, answer no. The model does not need to reflect all the points in the rubric. The response is correct as long as it recalls and utilizes the user's personal information correctly.${tail("Rubric", closing)}`;
    default:
      throw new Error(`unsupported LongMemEval question type: ${questionType}`);
  }
}
