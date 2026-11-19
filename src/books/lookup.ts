// Book metadata from Google Books, with Open Library as the fallback and gap filler.

// Open Library asks clients to send a descriptive User-Agent.
const USER_AGENT = "fol-staff/1.0 (Friends of Literacy book intake)";
// Open Library often takes several seconds per request.
const TIMEOUT_MS = 15_000;

export interface BookInfo {
  isbn: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  pageCount: number | null;
  description: string | null;
  coverUrl: string | null;
  sourceCategories: string[];
  /** Language codes as the source reports them: "en" from Google, "eng,spa" from Open Library. */
  languageCode: string | null;
  source: "google" | "openlibrary" | "google+openlibrary";
  raw: { google?: unknown; openlibrary?: unknown };
}

type Partial = Omit<BookInfo, "source" | "raw">;

async function getJson(url: string, retries = 1): Promise<any | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (retries > 0) return getJson(url, retries - 1);
    throw err;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}

/** Try a source; a network error or bad status counts as "not found" so the other source still runs. */
async function attempt<T>(name: string, fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[lookup] ${name} failed:`, (err as Error).message);
    return null;
  }
}

export async function googleBooks(isbn: string, apiKey?: string): Promise<{ book: Partial; raw: unknown } | null> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", `isbn:${isbn}`);
  if (apiKey) url.searchParams.set("key", apiKey);
  const data = await getJson(url.toString());
  const item = data?.items?.[0];
  const v = item?.volumeInfo;
  if (!v?.title) return null;
  const cover = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null;
  return {
    raw: item,
    book: {
      isbn,
      title: v.title,
      subtitle: v.subtitle ?? null,
      authors: v.authors ?? [],
      publisher: v.publisher ?? null,
      publishedDate: v.publishedDate ?? null,
      pageCount: typeof v.pageCount === "number" && v.pageCount > 0 ? v.pageCount : null,
      description: v.description ?? null,
      coverUrl: cover ? cover.replace(/^http:/, "https:") : null,
      sourceCategories: v.categories ?? [],
      languageCode: v.language ?? null,
    },
  };
}

export async function openLibrary(isbn: string): Promise<{ book: Partial; raw: unknown } | null> {
  const data = await getJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  const d = data?.[`ISBN:${isbn}`];
  if (!d?.title) return null;

  // jscmd=data has no description; the work record usually does.
  let description: string | null = null;
  const edition = await attempt("openlibrary edition", () => getJson(`https://openlibrary.org/isbn/${isbn}.json`));
  const workKey: string | undefined = edition?.works?.[0]?.key;
  if (workKey) {
    const work = await attempt("openlibrary work", () => getJson(`https://openlibrary.org${workKey}.json`));
    const desc = work?.description;
    description = typeof desc === "string" ? desc : (desc?.value ?? null);
  }

  return {
    raw: d,
    book: {
      isbn,
      title: d.title,
      subtitle: d.subtitle ?? null,
      authors: (d.authors ?? []).map((a: { name: string }) => a.name),
      publisher: d.publishers?.[0]?.name ?? null,
      publishedDate: d.publish_date ?? null,
      pageCount: d.number_of_pages ?? null,
      description,
      coverUrl: d.cover?.large ?? d.cover?.medium ?? null,
      languageCode:
        (edition?.languages ?? []).map((l: { key: string }) => l.key.replace("/languages/", "")).join(",") || null,
      sourceCategories: (d.subjects ?? [])
        .map((s: { name: string }) => s.name)
        // Drop machine tags such as "nyt:trade-fiction-paperback=2021-11-07".
        .filter((name: string) => !/[:=]/.test(name))
        .slice(0, 15),
    },
  };
}

function hasGaps(b: Partial): boolean {
  return (
    !b.description || !b.coverUrl || b.sourceCategories.length === 0 || b.authors.length === 0 || !b.pageCount
  );
}

/** Google Books first. Open Library fills gaps, or answers alone when Google has nothing. */
export async function lookupBook(isbn: string, googleApiKey?: string): Promise<BookInfo | null> {
  const google = await attempt("google books", () => googleBooks(isbn, googleApiKey));
  if (google && !hasGaps(google.book)) {
    return { ...google.book, source: "google", raw: { google: google.raw } };
  }

  const ol = await attempt("open library", () => openLibrary(isbn));
  if (!google && !ol) return null;
  if (!google) return { ...ol!.book, source: "openlibrary", raw: { openlibrary: ol!.raw } };
  if (!ol) return { ...google.book, source: "google", raw: { google: google.raw } };

  const g = google.book;
  const o = ol.book;
  return {
    ...g,
    authors: g.authors.length ? g.authors : o.authors,
    publisher: g.publisher ?? o.publisher,
    publishedDate: g.publishedDate ?? o.publishedDate,
    pageCount: g.pageCount ?? o.pageCount,
    description: g.description ?? o.description,
    coverUrl: g.coverUrl ?? o.coverUrl,
    // Open Library can list several languages for a bilingual edition; Google lists one.
    languageCode: o.languageCode?.includes(",") ? o.languageCode : (g.languageCode ?? o.languageCode),
    sourceCategories: [...new Set([...g.sourceCategories, ...o.sourceCategories])],
    source: "google+openlibrary",
    raw: { google: google.raw, openlibrary: ol.raw },
  };
}
