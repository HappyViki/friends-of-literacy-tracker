// Library card numbers: <location code>-<6-digit sequence>-<Luhn check digit>, e.g. MID-004217-3.
// The number carries no personal details; the check digit catches most typing mistakes.

const CARD_RE = /^([A-Z]{2,5})-?(\d{6,})-?(\d)$/;

/** Luhn (mod 10) check digit for a string of digits. */
export function luhnCheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    // Double every second digit, starting from the rightmost one.
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function formatCardNumber(locationCode: string, sequence: number | bigint): string {
  const seq = String(sequence).padStart(6, "0");
  return `${locationCode}-${seq}-${luhnCheckDigit(seq)}`;
}

/** Canonical form of a typed or scanned card number, or null when it is malformed or fails the check digit. */
export function parseCardNumber(input: string): string | null {
  const m = CARD_RE.exec(input.trim().toUpperCase().replace(/\s+/g, ""));
  if (!m) return null;
  const [, code, seq, check] = m;
  return luhnCheckDigit(seq) === Number(check) ? `${code}-${seq}-${check}` : null;
}

/** True when the input is shaped like a card number, even if its check digit is wrong. */
export function looksLikeCardNumber(input: string): boolean {
  return CARD_RE.test(input.trim().toUpperCase().replace(/\s+/g, ""));
}
