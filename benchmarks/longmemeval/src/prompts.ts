// The prompts. The reader prompt is the same for both arms. Only the sessions in it differ.
// The judge prompts are the benchmark's own, one per question type, copied exactly.

export interface Turn {
  role: string;
  content: string;
}

export interface SessionView {
  date: string;
  turns: Turn[];
}

export const renderSession = (s: SessionView, n: number): string => `### Session ${n}\nSession Date: ${s.date}\n${s.turns.map((t) => `${t.role}: ${t.content}`).join("\n")}`;

/** The question and the chats the model may use: every session of the haystack, or the ones akm returned. */
export function readerPrompt(sessions: SessionView[], questionDate: string, question: string): string {
  const history = sessions.length > 0 ? sessions.map((s, i) => renderSession(s, i + 1)).join("\n\n") : "(there are no chats)";
  return [
    "I will give you several history chats between you and a user. Please answer the question based on the relevant chat history. Answer concisely. If the chat history does not hold the information needed, say that you do not know.",
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

/** The benchmark's label rule: the judge's reply holds "yes". */
export const isYes = (verdict: string): boolean => verdict.toLowerCase().includes("yes");

/** A verdict that is exactly yes or no. Anything else is scored by the rule above but counted as undecidable. */
export const isDecidable = (verdict: string): boolean => ["yes", "no"].includes(verdict.trim().toLowerCase().replace(/^['".\s]+|['".\s]+$/g, ""));
