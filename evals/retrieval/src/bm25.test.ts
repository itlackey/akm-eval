import { describe, expect, test } from "bun:test";
import { Bm25 } from "./bm25.ts";

const docs = [
  { ref: "a/print", text: "Print the PDF with bleed and margins for the printer. PDF PDF." },
  { ref: "b/tests", text: "Write Playwright tests with the page object model." },
  { ref: "c/mixed", text: "A short note on print and on tests." },
  { ref: "d/other", text: "Nothing about either subject, only gardening and cooking." },
];

describe("Bm25", () => {
  const index = new Bm25(docs);

  test("ranks the documents that hold the query terms, best first, and leaves out the rest", () => {
    expect(index.search("pdf bleed margins", 10)).toEqual(["a/print"]);
    expect(index.search("print tests", 10).slice(0, 1)).toEqual(["c/mixed"]);
    expect(index.search("print tests", 10)).toHaveLength(3);
  });

  test("keeps only the first k", () => {
    expect(index.search("print tests", 2)).toHaveLength(2);
    expect(index.search("print tests", 0)).toEqual([]);
  });

  test("weighs a rare term above a common one", () => {
    const rare = new Bm25([
      { ref: "x", text: "alpha common" },
      { ref: "y", text: "common common common beta" },
      { ref: "z", text: "common gamma" },
    ]);
    expect(rare.search("alpha common", 3)[0]).toBe("x");
  });

  test("reads a query the way it reads a document: lowercase words and numbers", () => {
    expect(index.search("PLAYWRIGHT, Tests!", 10)[0]).toBe("b/tests");
    expect(index.search("oc-healthcheck.sh", 10)).toEqual([]);
    expect(new Bm25([{ ref: "s", text: "run oc-healthcheck.sh daily" }]).search("oc-healthcheck.sh", 10)).toEqual(["s"]);
  });

  test("returns nothing for a query with no known word, and breaks ties by ref", () => {
    expect(index.search("zzzz qqqq", 10)).toEqual([]);
    expect(index.search("", 10)).toEqual([]);
    const tie = new Bm25([
      { ref: "b", text: "same words" },
      { ref: "a", text: "same words" },
    ]);
    expect(tie.search("same", 10)).toEqual(["a", "b"]);
  });

  test("works over no documents", () => {
    expect(new Bm25([]).search("anything", 10)).toEqual([]);
  });
});
