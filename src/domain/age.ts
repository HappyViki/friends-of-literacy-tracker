// Children are stored with a birth year (and month when known); reports derive age brackets on the fly.

export const CHILD_AGE_BRACKETS = ["0-2", "3-5", "6-8", "9-12", "13-17", "18+"] as const;
export type ChildAgeBracket = (typeof CHILD_AGE_BRACKETS)[number];

/** Age in whole years on `at`. Without a birth month, assumes the birthday is mid-year (July). */
export function ageOn(birthYear: number, birthMonth: number | null, at: Date): number {
  const month = birthMonth ?? 7;
  const age = at.getUTCFullYear() - birthYear - (at.getUTCMonth() + 1 < month ? 1 : 0);
  return Math.max(0, age);
}

export function ageBracket(age: number): ChildAgeBracket {
  if (age <= 2) return "0-2";
  if (age <= 5) return "3-5";
  if (age <= 8) return "6-8";
  if (age <= 12) return "9-12";
  if (age <= 17) return "13-17";
  return "18+";
}

/** Birth year worked out from an age given on `at` (exact only to within a year). */
export function birthYearFromAge(age: number, at: Date): number {
  return at.getUTCFullYear() - age;
}

// The database has the same rules as child_age_bracket(birth_year, birth_month, at) (drizzle/0002).
