// The part of JSON Schema the replies akm asks a model for use, as a builder and a checker. The contract mode of the smoke
// (contract.ts) answers each request with the smallest value that fits the schema the request sends, so the stub
// needs no table for a reply whose only demand is its shape. The checker is for the tests: it says a value fits.
//
// It supports what akm 0.9.26 sends: type (one name or a list), enum, const, required, properties, additionalProperties,
// items, minItems, maxItems, minLength, maxLength, pattern, minimum, maximum, anyOf and oneOf. A keyword it does not know is
// ignored by the checker, and a schema it cannot build a value for (a $ref, an allOf, a pattern the fixed text does not match)
// throws, so that a change in what akm sends stops the smoke and does not pass as a value that nobody checked.

export type Schema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  anyOf?: Schema[];
  oneOf?: Schema[];
  [keyword: string]: unknown;
};

/** The text a string with no other demand gets. It is kebab-case, so it also fits the slug patterns akm sends. */
export const FIXED_TEXT = "smoke-text";

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

const typeNames = (schema: Schema): string[] => (schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type]);

/** A string for a schema: the fixed text, repeated to reach minLength and cut to maxLength, and checked against pattern. */
function stringFor(schema: Schema, where: string): string {
  const min = schema.minLength ?? 0;
  let text = FIXED_TEXT;
  while (text.length < min) text += `-${FIXED_TEXT}`;
  if (schema.maxLength !== undefined) text = text.slice(0, schema.maxLength);
  if (text.length < min) throw new Error(`${where}: minLength ${min} is above maxLength ${schema.maxLength}`);
  if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(text)) throw new Error(`${where}: the fixed text "${text}" does not match the pattern ${schema.pattern}`);
  return text;
}

/** A number for a schema: its minimum (or one step above an exclusive one), else 0, kept at or below its maximum. */
function numberFor(schema: Schema, integer: boolean, where: string): number {
  const step = integer ? 1 : 0.5;
  let n = schema.minimum ?? (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + step : 0);
  if (schema.maximum !== undefined && n > schema.maximum) n = schema.maximum;
  if (schema.exclusiveMaximum !== undefined && n >= schema.exclusiveMaximum) n = schema.exclusiveMaximum - step;
  if (integer) n = Math.ceil(n);
  if (!check(schema, n).length) return n;
  throw new Error(`${where}: no ${integer ? "integer" : "number"} fits the bounds`);
}

/**
 * The smallest value that fits `schema`: an object holds its required keys, an enum takes its first value, a string is the fixed
 * text, a number is the minimum (0 without one), an array holds one item (as many as minItems asks, none when maxItems is 0), a
 * list of types takes its first type that is not null, and anyOf and oneOf take their first branch. `where` names the place in
 * an error.
 */
export function valueFor(schema: Schema, where = "schema"): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum !== undefined) {
    if (schema.enum.length === 0) throw new Error(`${where}: an empty enum has no value`);
    return schema.enum[0];
  }
  for (const key of ["$ref", "allOf", "not", "if"]) if (schema[key] !== undefined) throw new Error(`${where}: "${key}" is not supported`);
  const branches = schema.anyOf ?? schema.oneOf;
  if (branches !== undefined) {
    if (branches.length === 0) throw new Error(`${where}: an empty anyOf has no value`);
    return valueFor(branches[0] as Schema, `${where}.anyOf[0]`);
  }
  const types = typeNames(schema);
  const type = types.find((t) => t !== "null") ?? types[0] ?? (schema.properties ? "object" : undefined);
  switch (type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const key of schema.required ?? []) {
        const sub = schema.properties?.[key];
        if (sub === undefined) throw new Error(`${where}: "${key}" is required and has no schema`);
        out[key] = valueFor(sub, `${where}.${key}`);
      }
      return out;
    }
    case "array": {
      if (schema.maxItems === 0) return [];
      const n = Math.max(1, schema.minItems ?? 0);
      return Array.from({ length: n }, () => (schema.items ? valueFor(schema.items, `${where}[]`) : FIXED_TEXT));
    }
    case "string":
      return stringFor(schema, where);
    case "integer":
      return numberFor(schema, true, where);
    case "number":
      return numberFor(schema, false, where);
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      throw new Error(`${where}: no type to build a value from`);
  }
}

const typeOf = (x: unknown): string => (x === null ? "null" : Array.isArray(x) ? "array" : Number.isInteger(x) ? "integer" : typeof x);

/** Does `value` have the JSON type `name`? An integer is a number too. */
const hasType = (value: unknown, name: string): boolean => (name === "number" ? typeof value === "number" && Number.isFinite(value) : typeOf(value) === name);

/** The ways `value` does not fit `schema`, each a sentence that starts with where it is. Empty when it fits. */
export function check(schema: Schema, value: unknown, where = "value"): string[] {
  const problems: string[] = [];
  const types = typeNames(schema);
  if (types.length > 0 && !types.some((t) => hasType(value, t))) return [`${where} is ${typeOf(value)}, expected ${types.join(" or ")}`];
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) problems.push(`${where} is not ${JSON.stringify(schema.const)}`);
  if (schema.enum !== undefined && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) problems.push(`${where} is ${JSON.stringify(value)}, expected one of ${JSON.stringify(schema.enum)}`);
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = schema[key];
    if (branches !== undefined && !branches.some((b) => check(b, value, where).length === 0)) problems.push(`${where} fits none of the ${key} branches`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${where} has ${value.length} characters, minLength is ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push(`${where} has ${value.length} characters, maxLength is ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) problems.push(`${where} does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${where} is ${value}, minimum is ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${where} is ${value}, maximum is ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) problems.push(`${where} is ${value}, above ${schema.exclusiveMinimum} was needed`);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) problems.push(`${where} is ${value}, below ${schema.exclusiveMaximum} was needed`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${where} has ${value.length} items, minItems is ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${where} has ${value.length} items, maxItems is ${schema.maxItems}`);
    if (schema.items) value.forEach((item, i) => problems.push(...check(schema.items as Schema, item, `${where}[${i}]`)));
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) problems.push(`${where} lacks the required key "${key}"`);
    for (const [key, sub] of Object.entries(schema.properties ?? {})) if (key in value) problems.push(...check(sub, value[key], `${where}.${key}`));
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in (schema.properties ?? {}))) problems.push(`${where} has the key "${key}", which the schema does not allow`);
  }
  return problems;
}
