// Keyword fallback used when no AI model answers. Checks the Google Books / Open Library
// subjects first, then the title and description. Order matters: the first rule that matches wins.
import type { Category, Language, ReadingLevel } from "./categories.ts";
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

type LevelInput = Pick<BookInfo, "sourceCategories" | "title" | "description" | "pageCount">;

/**
 * Reading level from subject tags and page count. Library subjects mark children's books
 * ("Juvenile fiction", "Board books", "Readers (Primary)"); a book with none of those marks is
 * taken to be for adults.
 */
export function readingLevelByRules(book: LevelInput): ReadingLevel {
  const subjects = book.sourceCategories.join(" | ").toLowerCase();
  const pages = book.pageCount;
  if (/\bboard books?\b/.test(subjects)) return "Board Book";
  if (/\bpicture books?\b|\bstories in rhyme\b|\btoddler\b/.test(subjects)) return "Picture Book";
  if (/\b(early|beginning|easy) readers?\b|readers \(primary\)|\bi can read\b|\bleveled readers?\b/.test(subjects)) {
    return "Early Reader";
  }
  if (/\b(young adult|teen)\b/.test(subjects)) return "YA";
  if (/\bjuvenile\b|\bchildren'?s\b/.test(subjects)) {
    if (pages !== null && pages <= 48) return "Picture Book";
    return "Chapter Book";
  }
  return "Adult";
}

/** Bilingual from subjects or title ("Spanish language materials -- Bilingual", "Colors / Colores"). */
export function languageByRules(book: Pick<BookInfo, "sourceCategories" | "title" | "subtitle">): Language | null {
  const text = `${book.sourceCategories.join(" | ")} | ${book.title} ${book.subtitle ?? ""}`.toLowerCase();
  if (/\bbilingual\b|\bbilingüe\b|english and spanish|spanish and english|inglés y español/.test(text)) return "Bilingual";
  return null;
}
