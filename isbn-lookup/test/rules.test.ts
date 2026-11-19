import assert from "node:assert/strict";
import { test } from "node:test";
import { categorizeByRules } from "../src/rules.ts";

const b = (sourceCategories: string[], title = "", description: string | null = null) => ({ sourceCategories, title, description });

test("subjects drive the category", () => {
  assert.equal(categorizeByRules(b(["hard science-fiction", "sci-fi"])), "Science Fiction");
  assert.equal(categorizeByRules(b(["Computers / Programming Languages / Python"])), "Technology & Programming");
  assert.equal(categorizeByRules(b(["Juvenile Fiction / Animals"])), "Children's");
  assert.equal(categorizeByRules(b(["Biography & Autobiography / Presidents"])), "Biography & Memoir");
});

test("falls back to title/description, then null", () => {
  assert.equal(categorizeByRules(b([], "The Joy of Cooking")), "Cooking & Food");
  assert.equal(categorizeByRules(b([], "Untitled")), null);
});

import { readingLevelByRules } from "../src/rules.ts";
const lv = (sourceCategories: string[], pageCount: number | null = null) =>
  readingLevelByRules({ sourceCategories, pageCount, title: "", description: null });

test("reading level from subjects and page count", () => {
  assert.equal(lv(["Board books", "Animals"]), "Board Book");
  assert.equal(lv(["Picture books for children"]), "Picture Book");
  assert.equal(lv(["Readers (Primary)"]), "Early Reader");
  assert.equal(lv(["Young adult fiction"]), "YA");
  assert.equal(lv(["Juvenile fiction"], 32), "Picture Book");
  assert.equal(lv(["Juvenile fiction"], 180), "Chapter Book");
  assert.equal(lv(["Science fiction"], 400), "Adult");
});
