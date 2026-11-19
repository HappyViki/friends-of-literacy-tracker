import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeIsbn } from "../src/books/isbn.ts";

test("ISBN-13 with hyphens is kept", () => {
  assert.equal(normalizeIsbn("978-0-441-17271-9"), "9780441172719");
});

test("ISBN-10 converts to ISBN-13", () => {
  assert.equal(normalizeIsbn("0441172717"), "9780441172719");
  assert.equal(normalizeIsbn("0-8044-2957-X"), "9780804429573");
});

test("bad checksums and junk are rejected", () => {
  assert.equal(normalizeIsbn("9780441172710"), null);
  assert.equal(normalizeIsbn("0441172718"), null);
  assert.equal(normalizeIsbn("hello"), null);
});
