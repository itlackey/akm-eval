import { describe, expect, test } from "bun:test";
import { AKM_0_9_26_REQUESTS } from "./fixtures.ts";
import { FIXED_TEXT, type Schema, check, valueFor } from "./schema.ts";

describe("valueFor", () => {
  test("an object holds its required keys and nothing else", () => {
    const schema: Schema = { type: "object", required: ["a", "b"], properties: { a: { type: "string" }, b: { type: "integer" }, c: { type: "string" } } };
    expect(valueFor(schema)).toEqual({ a: FIXED_TEXT, b: 0 });
    expect(valueFor({ type: "object", properties: { a: { type: "string" } } })).toEqual({});
    expect(valueFor({ properties: { a: { type: "string" } }, required: ["a"] })).toEqual({ a: FIXED_TEXT }); // no type, but properties: an object
  });

  test("an enum takes its first value, a const its value", () => {
    expect(valueFor({ type: "string", enum: ["duplicate", "subsumed"] })).toBe("duplicate");
    expect(valueFor({ type: ["string", "null"], enum: ["A", "B", null] })).toBe("A");
    expect(valueFor({ enum: [null, "A"] })).toBeNull();
    expect(valueFor({ const: 7 })).toBe(7);
  });

  test("a string is the fixed text, made longer to reach minLength and cut to maxLength", () => {
    expect(valueFor({ type: "string" })).toBe("smoke-text");
    const long = valueFor({ type: "string", minLength: 50 }) as string;
    expect(long.length).toBeGreaterThanOrEqual(50);
    expect(check({ type: "string", minLength: 50 }, long)).toEqual([]);
    expect(valueFor({ type: "string", maxLength: 5 })).toBe("smoke");
    expect(() => valueFor({ type: "string", minLength: 10, maxLength: 5 })).toThrow("minLength 10 is above maxLength 5");
  });

  test("a string that has a pattern keeps the fixed text only when it matches, and says so when it does not", () => {
    expect(valueFor({ type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$" })).toBe("smoke-text");
    expect(() => valueFor({ type: "string", pattern: "^[A-Z]+$" }, "reply.name")).toThrow('reply.name: the fixed text "smoke-text" does not match the pattern ^[A-Z]+$');
  });

  test("a number is its minimum, 0 without one, kept inside the bounds", () => {
    expect(valueFor({ type: "integer", minimum: 1, maximum: 5 })).toBe(1);
    expect(valueFor({ type: "number", minimum: 0, maximum: 1 })).toBe(0);
    expect(valueFor({ type: "number" })).toBe(0);
    expect(valueFor({ type: "integer", minimum: 3 })).toBe(3);
    expect(valueFor({ type: "integer", maximum: -2 })).toBe(-2);
    expect(valueFor({ type: "integer", exclusiveMinimum: 0 })).toBe(1);
    expect(valueFor({ type: "number", exclusiveMinimum: 0 })).toBe(0.5);
    expect(() => valueFor({ type: "integer", minimum: 3, maximum: 3, exclusiveMaximum: 3 })).toThrow("no integer fits the bounds");
  });

  test("an array holds one item, as many as minItems asks, and none when maxItems is 0", () => {
    expect(valueFor({ type: "array", items: { type: "string" } })).toEqual([FIXED_TEXT]);
    expect(valueFor({ type: "array", items: { type: "integer", minimum: 4 }, minItems: 3 })).toEqual([4, 4, 4]);
    expect(valueFor({ type: "array", items: { type: "string" }, maxItems: 0 })).toEqual([]);
    expect(valueFor({ type: "array" })).toEqual([FIXED_TEXT]);
  });

  test("a list of types takes the first that is not null, anyOf its first branch, and null is null", () => {
    expect(valueFor({ type: ["null", "string"] })).toBe(FIXED_TEXT);
    expect(valueFor({ type: ["string", "null"] })).toBe(FIXED_TEXT);
    expect(valueFor({ type: "null" })).toBeNull();
    expect(valueFor({ anyOf: [{ type: "integer", minimum: 2 }, { type: "string" }] })).toBe(2);
    expect(valueFor({ oneOf: [{ type: "boolean" }] })).toBe(false);
  });

  test("a schema it cannot build for is an error that names the place, so that a change in what akm sends stops the smoke", () => {
    expect(() => valueFor({ $ref: "#/defs/x" })).toThrow('schema: "$ref" is not supported');
    expect(() => valueFor({ allOf: [{ type: "string" }] })).toThrow('"allOf" is not supported');
    expect(() => valueFor({ type: "object", required: ["a"], properties: {} }, "reply")).toThrow('reply: "a" is required and has no schema');
    expect(() => valueFor({ type: "object", required: ["a"], properties: { a: { enum: [] } } })).toThrow("schema.a: an empty enum has no value");
    expect(() => valueFor({})).toThrow("no type to build a value from");
    expect(() => valueFor({ anyOf: [] })).toThrow("an empty anyOf");
  });

  test("nests: the places it reports are paths", () => {
    const schema: Schema = { type: "object", required: ["list"], properties: { list: { type: "array", items: { type: "object", required: ["n"], properties: { n: { type: "string", pattern: "^X$" } } } } } };
    expect(() => valueFor(schema)).toThrow("schema.list[].n:");
  });
});

describe("check", () => {
  const schema: Schema = {
    type: "object",
    required: ["name", "scores"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 3, maxLength: 6, pattern: "^[a-z]+$" },
      scores: { type: "object", required: ["a"], properties: { a: { type: "integer", minimum: 1, maximum: 5 } } },
      kind: { type: ["string", "null"], enum: ["x", null] },
      tags: { type: "array", items: { type: "string" }, maxItems: 2 },
    },
  };
  const good = { name: "abc", scores: { a: 3 }, kind: null, tags: ["t"] };

  test("accepts a value that fits", () => {
    expect(check(schema, good)).toEqual([]);
  });

  test("names every way a value does not fit, with where", () => {
    expect(check(schema, "x")).toEqual(["value is string, expected object"]);
    expect(check(schema, { scores: { a: 3 } })).toEqual(['value lacks the required key "name"']);
    expect(check(schema, { ...good, extra: 1 })).toEqual(['value has the key "extra", which the schema does not allow']);
    expect(check(schema, { ...good, name: "ab" })).toEqual(["value.name has 2 characters, minLength is 3"]);
    expect(check(schema, { ...good, name: "abcdefg" })).toEqual(["value.name has 7 characters, maxLength is 6"]);
    expect(check(schema, { ...good, name: "ab1" })).toEqual(["value.name does not match ^[a-z]+$"]);
    expect(check(schema, { ...good, scores: { a: 6 } })).toEqual(["value.scores.a is 6, maximum is 5"]);
    expect(check(schema, { ...good, scores: { a: 0 } })).toEqual(["value.scores.a is 0, minimum is 1"]);
    expect(check(schema, { ...good, scores: { a: 2.5 } })).toEqual(["value.scores.a is number, expected integer"]);
    expect(check(schema, { ...good, kind: "y" })).toEqual(['value.kind is "y", expected one of ["x",null]']);
    expect(check(schema, { ...good, tags: ["a", "b", "c"] })).toEqual(["value.tags has 3 items, maxItems is 2"]);
    expect(check(schema, { ...good, tags: [1] })).toEqual(["value.tags[0] is integer, expected string"]);
  });

  test("anyOf and oneOf need one branch to fit, const needs its value, an integer is a number, null is not an object", () => {
    expect(check({ anyOf: [{ type: "integer" }, { type: "string" }] }, "x")).toEqual([]);
    expect(check({ anyOf: [{ type: "integer" }, { type: "string" }] }, true)).toEqual(["value fits none of the anyOf branches"]);
    expect(check({ const: "a" }, "b")).toEqual(['value is not "a"']);
    expect(check({ type: "number" }, 3)).toEqual([]);
    expect(check({ type: "object" }, null)).toEqual(["value is null, expected object"]);
    expect(check({ type: "object" }, [])).toEqual(["value is array, expected object"]);
    expect(check({ type: "integer", exclusiveMinimum: 1 }, 1)).toEqual(["value is 1, above 1 was needed"]);
  });
});

describe("the requests akm 0.9.26 sends", () => {
  const withSchema = AKM_0_9_26_REQUESTS.filter((f) => f.schema !== undefined);

  test("the fixtures hold the kinds of request the evals make", () => {
    expect(AKM_0_9_26_REQUESTS.map((f) => `${f.eval}: ${f.name}`)).toEqual([
      "judge-gate: judge",
      "reflect: reflect",
      "distill: distill lesson",
      "distill: distill judge",
      "consolidate: pair judge",
      "consolidate: pair second look",
      "consolidate: promotion plan",
      "extract: extract",
      "promotion: judgment",
      "(all): probe",
    ]);
    expect(withSchema).toHaveLength(8);
  });

  for (const f of AKM_0_9_26_REQUESTS.filter((x) => x.schema !== undefined)) {
    test(`valueFor builds a value that fits the schema of ${f.eval}: ${f.name}`, () => {
      const value = valueFor(f.schema as Schema);
      expect(check(f.schema as Schema, value)).toEqual([]);
    });
  }

  test("what the builder gives for them is what the contract mode is built on: required keys, first enum values, the minimum", () => {
    const by = (name: string) => valueFor((AKM_0_9_26_REQUESTS.find((f) => f.name === name) as { schema: Schema }).schema);
    expect(by("judge")).toEqual({ scores: { need: 1, preservation: 1, quality: 1 }, reason: FIXED_TEXT });
    expect(by("reflect")).toEqual({ confidence: 0, frontmatterPatch: { description: FIXED_TEXT, when_to_use: FIXED_TEXT, title: FIXED_TEXT } });
    expect(by("pair judge")).toMatchObject({ onlyInA: [FIXED_TEXT], onlyInB: [FIXED_TEXT], relation: "duplicate", redundant: "A", stale: "A", confidence: 0 });
    expect(by("extract")).toMatchObject({ candidates: [{ type: "memory", name: FIXED_TEXT, confidence: 0 }] });
    expect(by("pair second look")).toEqual({ missing: [FIXED_TEXT] });
  });
});
