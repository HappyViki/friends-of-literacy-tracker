// Contact details are stored normalized so the same person always matches the same row.

export function normalizeEmail(input: string | null | undefined): string | null {
  const email = input?.trim().toLowerCase();
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** E.164 phone number. Bare 10-digit numbers are treated as US/Canada (+1). */
export function normalizePhone(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
