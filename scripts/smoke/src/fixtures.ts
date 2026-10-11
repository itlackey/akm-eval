// The requests akm-cli 0.9.26 sends to the model, one of each kind the evals trigger, as the smoke saw them on 2026-10-11: it ran
// each eval on one case against a stub that logged the request bodies. They pin the contract tests (contract.test.ts) to what akm
// sent then, so that the schema builder and the canned replies are tested against akm's own schemas without running akm. The
// live check that akm still sends these is the contract mode itself, which answers the requests it gets.
//
// `prompt` is the start of the last user message, as far as it is the same for every case. `schema` is the response_format
// json_schema of the request, and is left out of one that sends none (akm's probe of the endpoint, and the promotion judge).

import type { Schema } from "./schema.ts";

export interface Fixture {
  /** The eval that makes akm send it, or "(all)". */
  eval: string;
  name: string;
  prompt: string;
  schema: Schema | undefined;
}

export const AKM_0_9_26_REQUESTS: Fixture[] = [
  {
    eval: "judge-gate",
    name: "judge",
    prompt: "You are evaluating a proposed revision of an existing akm asset",
    schema: {"type":"object","required":["scores","reason"],"additionalProperties":false,"properties":{"scores":{"type":"object","required":["need","preservation","quality"],"additionalProperties":false,"properties":{"need":{"type":"integer","minimum":1,"maximum":5},"preservation":{"type":"integer","minimum":1,"maximum":5},"quality":{"type":"integer","minimum":1,"maximum":5}}},"reason":{"type":"string"}}},
  },
  {
    eval: "reflect",
    name: "reflect",
    prompt: "Your task is to check this command asset's",
    schema: {"type":"object","required":["confidence","frontmatterPatch"],"additionalProperties":false,"properties":{"confidence":{"type":"number","minimum":0,"maximum":1,"description":"Self-reported quality confidence in [0, 1]. Persisted on the proposal for reviewers and the triage judge to read during adjudication."},"frontmatterPatch":{"type":"object","required":["description","when_to_use","title"],"additionalProperties":false,"properties":{"description":{"type":["string","null"]},"when_to_use":{"type":["string","null"]},"title":{"type":["string","null"]}}}}},
  },
  {
    eval: "distill",
    name: "distill lesson",
    prompt: "Asset ref: memories/",
    schema: {"type":"object","required":["description","when_to_use","body"],"additionalProperties":false,"properties":{"description":{"type":"string","minLength":10,"description":"Single complete sentence (80-200 chars) summarising what the lesson teaches. No markdown, no leading 'When'/'If'."},"when_to_use":{"type":"string","minLength":10,"description":"Single complete sentence describing the concrete trigger condition for the lesson."},"body":{"type":"string","minLength":1,"description":"Lesson body — plain markdown, 1-3 short paragraphs of practical guidance."},"tags":{"type":"array","items":{"type":"string"},"description":"Optional tag list. Empty array is allowed; the post-processor drops it if empty."}}},
  },
  {
    eval: "distill",
    name: "distill judge",
    prompt: "You are evaluating a proposed lesson asset",
    schema: {"type":"object","required":["scores","reason"],"additionalProperties":false,"properties":{"scores":{"type":"object","required":["novelty","nonRedundancy","grounding"],"additionalProperties":false,"properties":{"novelty":{"type":"integer","minimum":1,"maximum":5},"nonRedundancy":{"type":"integer","minimum":1,"maximum":5},"grounding":{"type":"integer","minimum":1,"maximum":5}}},"reason":{"type":"string"}}},
  },
  {
    eval: "consolidate",
    name: "pair judge",
    prompt: "Asset A (older):",
    schema: {"type":"object","required":["onlyInA","onlyInB","relation","redundant","stale","confidence","reason"],"additionalProperties":false,"properties":{"onlyInA":{"type":"array","items":{"type":"string","maxLength":200},"maxItems":20},"onlyInB":{"type":"array","items":{"type":"string","maxLength":200},"maxItems":20},"relation":{"type":"string","enum":["duplicate","subsumed","supersedes","contradicts","overlap","unrelated"]},"redundant":{"type":["string","null"],"enum":["A","B",null]},"stale":{"type":["string","null"],"enum":["A",null]},"confidence":{"type":"number","minimum":0,"maximum":1},"reason":{"type":"string","maxLength":400}}},
  },
  {
    eval: "consolidate",
    name: "pair second look",
    prompt: "Note X (to delete):",
    schema: {"type":"object","required":["missing"],"additionalProperties":false,"properties":{"missing":{"type":"array","items":{"type":"string","maxLength":200},"maxItems":20}}},
  },
  {
    eval: "consolidate",
    name: "promotion plan",
    prompt: "Source: bundle",
    schema: {"type":"object","required":["operations"],"additionalProperties":false,"properties":{"operations":{"type":"array","description":"Ordered list of promote operations the planner proposes.","items":{"type":"object","required":["op","ref","knowledgeRef","reason"],"additionalProperties":false,"properties":{"op":{"type":"string","enum":["promote"]},"ref":{"type":"string","minLength":1},"knowledgeRef":{"type":"string","minLength":1},"reason":{"type":"string","minLength":1,"maxLength":200},"description":{"type":"string"},"confidence":{"type":"number","minimum":0,"maximum":1}}}}}},
  },
  {
    eval: "extract",
    name: "extract",
    prompt: "You are extracting durable engineering insights",
    schema: {"type":"object","required":["candidates"],"additionalProperties":false,"properties":{"candidates":{"type":"array","description":"Zero or more durable-insight candidates extracted from the session.","items":{"type":"object","required":["type","name","description","body","confidence","evidence"],"additionalProperties":false,"properties":{"type":{"type":"string","enum":["memory","lesson","knowledge"],"description":"Asset type the candidate would land as."},"name":{"type":"string","description":"Kebab-case slug, optionally under one stable scope/domain segment.","pattern":"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$"},"description":{"type":"string","minLength":20,"maxLength":400,"description":"One-sentence summary of the candidate. Must be a complete sentence in active voice. Do NOT start with 'When', 'If', 'How', 'Use', or 'Avoid'. Do NOT end with ':', ';', or ','. Do NOT use heading-fragment text ('Summary', 'Overview', 'Key finding:'). Minimum 20 characters, maximum 400 characters."},"when_to_use":{"type":"string","minLength":15,"maxLength":400,"description":"Trigger sentence for the candidate; REQUIRED when type=lesson."},"body":{"type":"string","minLength":50,"description":"Markdown body of the candidate asset."},"confidence":{"type":"number","minimum":0,"maximum":1,"description":"Self-rated confidence in [0, 1] that this candidate is a real durable insight."},"evidence":{"type":"string","minLength":5,"description":"One-line pointer to the moment in the session that supports this candidate."}}}},"rationale_if_empty":{"type":"string","minLength":10,"description":"Required when `candidates` is empty — explains why nothing rose to durable-insight level."}}},
  },
  {
    eval: "promotion",
    name: "judgment",
    prompt: "You are adjudicating a pending knowledge-base proposal",
    schema: undefined,
  },
  {
    eval: "(all)",
    name: "probe",
    prompt: "Respond with just the word: ok",
    schema: undefined,
  },
];
