/** Strip spaces/hyphens and validate an ISBN-10 or ISBN-13 checksum. Returns ISBN-13 or null. */
export function normalizeIsbn(input: string): string | null {
  const s = input.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((acc, ch, i) => acc + (ch === "X" ? 10 : Number(ch)) * (10 - i), 0);
    if (sum % 11 !== 0) return null;
    return toIsbn13(s.slice(0, 9));
  }
  if (/^\d{13}$/.test(s)) {
    return isbn13CheckDigit(s.slice(0, 12)) === s[12] ? s : null;
  }
  return null;
}

function toIsbn13(nineDigits: string): string {
  const base = "978" + nineDigits;
  return base + isbn13CheckDigit(base);
}

function isbn13CheckDigit(twelve: string): string {
  const sum = [...twelve].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}
