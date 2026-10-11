import { describe, expect, test } from "bun:test";
import { withoutIndirectNegation } from "./negation.ts";

describe("withoutIndirectNegation", () => {
  test("a negation of hesitation, forgetting, failure or turning down goes", () => {
    for (const text of ["do not hesitate to wait", "dont forget to wait", "never fail to wait", "be sure not to fail to wait", "do not ever neglect to wait", "never refuse to wait", "never stop waiting", "do not be afraid to wait", "without hesitation wait"]) {
      expect(withoutIndirectNegation(text), text).not.toMatch(/\b(?:not|dont|never|without)\b/);
      expect(withoutIndirectNegation(text), text).toMatch(/wait/);
    }
  });

  test("a negation of the action stays", () => {
    for (const text of ["do not wait", "never wait for networkidle", "dont skip tests", "do not fail the build", "never forget", "do not hesitate and never wait"]) {
      expect(withoutIndirectNegation(text), text).toMatch(/\b(?:not|dont|never)\b/);
    }
  });
});
