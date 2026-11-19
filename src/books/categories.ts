// Edit this list to change the categories. Keep "Other" last: it is the fallback.
export const CATEGORIES = [
  "Literary Fiction",
  "Mystery & Thriller",
  "Science Fiction",
  "Fantasy",
  "Romance",
  "Horror",
  "Historical Fiction",
  "Graphic Novels & Comics",
  "Poetry & Drama",
  "Children's",
  "Young Adult",
  "Biography & Memoir",
  "History",
  "Science & Nature",
  "Technology & Programming",
  "Business & Economics",
  "Self-Help & Personal Development",
  "Health & Fitness",
  "Cooking & Food",
  "Religion & Spirituality",
  "Philosophy",
  "Politics & Social Sciences",
  "Arts & Photography",
  "Travel",
  "Education & Reference",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Map a model reply to a category, or null when it names none. */
export function matchCategory(reply: string | null | undefined): Category | null {
  if (!reply) return null;
  const text = reply.trim().replace(/^["'*\s]+|["'*.\s]+$/g, "").toLowerCase();
  const exact = CATEGORIES.find((c) => c.toLowerCase() === text);
  if (exact) return exact;
  // Reasoning models sometimes wrap the answer in a sentence; take the longest name mentioned.
  const mentioned = CATEGORIES.filter((c) => text.includes(c.toLowerCase()));
  if (mentioned.length === 0) return null;
  return mentioned.sort((a, b) => b.length - a.length)[0];
}
