// Shapes returned by the staff API (src/services). Kept by hand; the API is small.

export type Me = { userId: string; email: string; role: "admin" | "staff" };

export type Location = {
  id: number;
  code: string;
  name: string;
  type: "branch" | "school" | "event" | "other";
  address: string | null;
  zipCode: string | null;
  active: boolean;
};

export type Language = { code: string; name: string };

export type FamilySummary = {
  householdId: string;
  cardNumber: string | null;
  zipCode: string;
  guardians: { firstName: string; lastName: string | null; email: string | null; phone: string | null }[];
  children: string[];
  score?: number;
  surveyDue: SurveyDue;
};

/** The survey a family should be asked next (first visit, or returning visitors when due), or null. */
export type SurveyDue = { survey: "intake" | "returning"; name: string; reason: string; lastSurveyAt: string | null } | null;

export type SearchResult = {
  matchedBy: "card" | "email" | "phone" | "name";
  cardStatus?: "active" | "lost" | "replaced" | "inactive";
  results: FamilySummary[];
};

export type Child = {
  id: string;
  firstName: string;
  birthYear: number | null;
  birthMonth: number | null;
  birthYearEstimated: boolean;
  age: number | null;
  ageBracket: string | null;
};

export type Family = {
  householdId: string;
  zipCode: string;
  signedUpAt: string;
  signedUpAtLocation: string;
  cardNumber: string | null;
  cards: { number: string; status: string; issuedAt: string; issuedAtLocation: string }[];
  languages: string[];
  guardians: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    ageRange: string | null;
    preferredLanguage: string | null;
    contactConsent: boolean;
  }[];
  children: Child[];
  booksReceived: number;
  giveaways: {
    distributionId: number;
    distributedAt: string;
    location: string;
    books: { isbn: string; title: string; category: string; readingLevel: string | null; language: string | null; condition: "new" | "used"; quantity: number; forChild: string | null }[];
  }[];
  surveyResponses: { responseId: number; survey: string; surveyName: string; submittedAt: string; answers: Record<string, unknown> }[];
  surveyDue: SurveyDue;
};

export type Book = {
  isbn: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  pageCount: number | null;
  description: string | null;
  coverUrl: string | null;
  source: string;
  category: string;
  categoryModel: string;
  categoryConfidence: number | null;
  readingLevel: string | null;
  readingLevelSource: string | null;
  readingLevelConfidence: number | null;
  language: string | null;
  languageSource: string | null;
  languageConfidence: number | null;
};

export type Classifications = { categories: string[]; readingLevels: string[]; languages: string[] };

export type StockRow = { locationId: number; location: string; condition: "new" | "used"; onHand: number };

export type BookScan = {
  book: Book;
  firstScan: boolean;
  stock: StockRow[];
  onHand: number;
  givenAway: { total: number; lastGivenAt: string | null };
  giveaways: {
    distributedAt: string;
    location: string;
    householdId: string;
    cardNumber: string | null;
    condition: "new" | "used";
    quantity: number;
    forChild: string | null;
  }[];
};

export type InventoryRow = {
  isbn: string;
  title: string;
  authors: string[];
  category: string;
  readingLevel: string | null;
  language: string | null;
  locationId: number;
  location: string;
  condition: "new" | "used";
  onHand: number;
};

export type LocalizedText = Record<string, string>;
export type Question = {
  id: number;
  key: string;
  type: "number" | "boolean" | "single_choice" | "multi_choice" | "scale" | "text";
  prompt: LocalizedText;
  choices: { value: string; label: LocalizedText }[] | null;
  minValue: number | null;
  maxValue: number | null;
  required: boolean;
};
export type Survey = { id: number; key: string; name: string; description: string | null; active: boolean; questions: Question[] };

export type StaffMember = {
  email: string;
  role: "staff" | "admin";
  active: boolean;
  createdAt: string;
  addedBy: string;
  /** Neon Auth account, if they have one. */
  authUserId: string | null;
  name: string | null;
  banned: boolean | null;
  /** Sign-in methods: "credential" (password), "google". */
  signIn: string[];
  lastActive: string | null;
};

export type Report = {
  filters: { from?: string; to?: string; locationId?: number };
  families: { served: number; returning: number; signed_up: number };
  booksGivenAway: {
    books: number;
    visits: number;
    byCondition: { condition: string; books: number }[];
    byCategory: { category: string; books: number }[];
    byReadingLevel: { reading_level: string; books: number }[];
    byBookLanguage: { language: string; books: number }[];
    byChildAgeBracketAndReadingLevel: { age_bracket: string; reading_level: string; books: number }[];
    byLocation: { location: string; name: string; books: number; families: number }[];
    byMonth: { month: string; books: number; families: number }[];
    byChildAgeBracket: { age_bracket: string; books: number }[];
    byHomeLanguage: { language: string; families: number; books: number }[];
  };
  stockOnHand: { location: string; condition: string; on_hand: number; titles: number }[];
  surveys: {
    readDaysPerWeek: Benchmark;
    childEnjoysReading: Benchmark;
    visitRating: Benchmark;
    heardAbout: { choice: string; label: string; families: number }[];
    comments: { key: string; question: string; text: string; submittedAt: string; householdId: string; cardNumber: string | null; location: string }[];
    booksInHome: { answer: string; families: number }[];
    everyoneReads: { yes: number; no: number; percent_yes: number | null };
  };
};

/** A benchmark survey question: average in range, and first vs. latest answer for families with 2+ answers. */
export type Benchmark = {
  average: number | null;
  responses: number;
  changeForReturningFamilies: { families: number; first_average: number | null; latest_average: number | null };
};
