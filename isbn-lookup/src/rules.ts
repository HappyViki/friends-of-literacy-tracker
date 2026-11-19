// Keyword fallback used when no AI model answers. Checks the Google Books / Open Library
// subjects first, then the title and description. Order matters: the first rule that matches wins.
import type { Category } from "./categories.ts";
import type { BookInfo } from "./lookup.ts";

const RULES: [Category, RegExp][] = [
  ["Graphic Novels & Comics", /\b(comics?|graphic novels?|manga)\b/],
  ["Young Adult", /\b(young adult|teen)\b/],
  ["Children's", /\b(juvenile|children'?s|picture books?)\b/],
  ["Science Fiction", /\b(science[- ]fiction|sci[- ]fi|space opera|dystopia)/],
  ["Fantasy", /\bfantasy\b/],
  ["Horror", /\bhorror\b/],
  ["Mystery & Thriller", /\b(mystery|mysteries|thrillers?|suspense|detective|crime fiction)\b/],
  ["Romance", /\bromance\b/],
  ["Historical Fiction", /\bhistorical fiction\b|fiction, historical/],
  ["Poetry & Drama", /\b(poetry|poems|drama|plays)\b/],
  ["Biography & Memoir", /\b(biography|autobiography|memoirs?)\b/],
  ["Cooking & Food", /\b(cooking|cookbooks?|recipes|food)\b/],
  ["Technology & Programming", /\b(computers?|programming|software|python|javascript|computer science)\b/],
  ["Business & Economics", /\b(business|economics|management|finance|marketing|entrepreneur)/],
  ["Self-Help & Personal Development", /\b(self[- ]help|personal development|self-improvement|success)\b/],
  ["Health & Fitness", /\b(health|fitness|nutrition|diet|exercise)\b/],
  ["Religion & Spirituality", /\b(religion|spiritual|christian|bible|buddhis|islam|judaism|theology)/],
  ["Philosophy", /\bphilosophy\b/],
  ["Politics & Social Sciences", /\b(politic|social science|sociology|government|law)/],
  ["Arts & Photography", /\b(art|arts|photography|design|music|architecture)\b/],
  ["Travel", /\b(travel|guidebooks?)\b/],
  ["Science & Nature", /\b(science|nature|biology|physics|chemistry|mathematics|astronomy)\b/],
  ["History", /\bhistory\b/],
  ["Education & Reference", /\b(education|reference|study aids|language arts|dictionaries)\b/],
  ["Literary Fiction", /\bfiction\b/],
];

export function categorizeByRules(book: Pick<BookInfo, "sourceCategories" | "title" | "description">): Category | null {
  const subjects = book.sourceCategories.join(" | ").toLowerCase();
  const text = `${book.title} ${book.description ?? ""}`.toLowerCase();
  for (const haystack of [subjects, text]) {
    if (!haystack.trim()) continue;
    for (const [category, re] of RULES) if (re.test(haystack)) return category;
  }
  return null;
}
