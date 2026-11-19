import assert from "node:assert/strict";
import { test } from "node:test";
import { matchCategory } from "../src/categories.ts";

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

import { languageFromCode, matchOption, READING_LEVELS } from "../src/categories.ts";

test("language codes map to English / Spanish / Other", () => {
  assert.equal(languageFromCode("en"), "English");
  assert.equal(languageFromCode("eng"), "English");
  assert.equal(languageFromCode("/languages/spa"), "Spanish");
  assert.equal(languageFromCode("es-MX"), "Spanish");
  assert.equal(languageFromCode("fre"), "Other");
  assert.equal(languageFromCode("mul"), null);
  assert.equal(languageFromCode(null), null);
});

test("reading level replies match whole words only", () => {
  assert.equal(matchOption("YA", READING_LEVELS), "YA");
  assert.equal(matchOption("It's a picture book.", READING_LEVELS), "Picture Book");
  assert.equal(matchOption("maybe", READING_LEVELS), null);
});
