import assert from "node:assert/strict";
import { test } from "node:test";
import { matchCategory } from "../src/books/categories.ts";

test("exact and loose replies match", () => {
  assert.equal(matchCategory("Science Fiction"), "Science Fiction");
  assert.equal(matchCategory("  **fantasy**. "), "Fantasy");
  assert.equal(matchCategory('"History"'), "History");
});

test("a sentence picks the longest category it names", () => {
  assert.equal(matchCategory("This is Historical Fiction."), "Historical Fiction");
});

test("unknown replies return null", () => {
  assert.equal(matchCategory("Cookbooks"), null);
  assert.equal(matchCategory(""), null);
  assert.equal(matchCategory(null), null);
});
