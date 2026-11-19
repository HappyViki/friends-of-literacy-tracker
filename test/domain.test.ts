import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCardNumber, luhnCheckDigit, parseCardNumber } from "../src/domain/cards.ts";
import { normalizeEmail, normalizePhone } from "../src/domain/contact.ts";
import { ageBracket, ageOn, birthYearFromAge } from "../src/domain/age.ts";

test("Luhn check digit matches the standard worked example", () => {
  // Wikipedia's Luhn example: payload 7992739871 has check digit 3.
  assert.equal(luhnCheckDigit("7992739871"), 3);
  // A valid Visa test number 4111 1111 1111 1111 ends in check digit 1.
  assert.equal(luhnCheckDigit("411111111111111"), 1);
});

test("card numbers round-trip and reject typos", () => {
  const card = formatCardNumber("MID", 4217);
  assert.match(card, /^MID-004217-\d$/);
  assert.equal(parseCardNumber(card), card);
  assert.equal(parseCardNumber(card.toLowerCase().replaceAll("-", "")), card); // scanned without dashes
  // Swapping two adjacent digits changes the check digit.
  assert.equal(parseCardNumber(card.replace("004217", "004271")), null);
  assert.equal(parseCardNumber("MID-4217"), null);
  assert.equal(parseCardNumber("maria@example.com"), null);
});

test("emails and phones normalize to one form", () => {
  assert.equal(normalizeEmail("  Maria@Example.COM "), "maria@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizePhone("(512) 555-0142"), "+15125550142");
  assert.equal(normalizePhone("1-512-555-0142"), "+15125550142");
  assert.equal(normalizePhone("+52 55 1234 5678"), "+525512345678");
  assert.equal(normalizePhone("555-0142"), null);
});

test("ages and brackets", () => {
  const at = new Date("2026-11-19T00:00:00Z");
  assert.equal(ageOn(2020, 12, at), 5); // birthday not reached yet
  assert.equal(ageOn(2020, 3, at), 6);
  assert.equal(ageOn(2020, null, at), 6); // assumes mid-year
  assert.equal(birthYearFromAge(4, at), 2022);
  assert.deepEqual([0, 2, 3, 5, 6, 8, 9, 12, 13, 17, 18].map(ageBracket), [
    "0-2", "0-2", "3-5", "3-5", "6-8", "6-8", "9-12", "9-12", "13-17", "13-17", "18+",
  ]);
});
