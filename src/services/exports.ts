// Contact exports for Mailchimp (or any CSV import). Only adults who agreed to be contacted at
// intake (guardians.contact_consent) are included: emailing or texting anyone else isn't allowed.
import { z } from "zod";
import { pool } from "../api/db.ts";
import { parse } from "../api/errors.ts";

const exportInput = z.object({
  // "email": rows with an email (Mailchimp audience); "phone": rows with a phone (SMS); "all": either.
  channel: z.enum(["email", "phone", "all"]).default("email"),
  // Family's home location (where they signed up).
  locationId: z.coerce.number().int().positive().optional(),
  // Adult's preferred language code, e.g. "es".
  language: z.string().regex(/^[a-z]{2,3}$/).optional(),
  // Only families with a visit on or after this date.
  visitedSince: z.iso.date().optional(),
});

// Mailchimp maps "Email Address", "First Name", "Last Name" and "Phone Number" automatically; the
// rest import as text fields, and "Tags" (comma-separated) becomes tags.
const COLUMNS = [
  "Email Address",
  "First Name",
  "Last Name",
  "Phone Number",
  "Zip Code",
  "Preferred Language",
  "Library Card",
  "Home Location",
  "Children",
  "Last Visit",
  "Tags",
] as const;

type Row = {
  email: string | null;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  zip_code: string;
  language: string | null;
  card: string | null;
  location_code: string;
  location_name: string;
  children: number;
  last_visit: string | null;
};

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote every cell; neutralize spreadsheet formulas in free-text fields.
  return `"${(/^[=+\-@]/.test(s) && !/^\+\d/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function contactsCsv(query: Record<string, string | undefined>) {
  const f = parse(exportInput, query);
  const { rows } = await pool.query<Row>(
    `select g.email, g.first_name, g.last_name, g.phone, h.zip_code,
            lang.name as language, c.number as card, l.code as location_code, l.name as location_name,
            (select count(*)::int from children ch where ch.household_id = h.id) as children,
            (select to_char(max(d.distributed_at), 'YYYY-MM-DD') from distributions d where d.household_id = h.id) as last_visit
     from guardians g
     join households h on h.id = g.household_id
     join locations l on l.id = h.home_location_id
     left join languages lang on lang.code = g.preferred_language_code
     left join library_cards c on c.household_id = h.id and c.status = 'active'
     where g.contact_consent
       and ($1 <> 'email' or g.email is not null)
       and ($1 <> 'phone' or g.phone is not null)
       and ($2::int is null or h.home_location_id = $2)
       and ($3::text is null or g.preferred_language_code = $3)
       and ($4::date is null or exists (select 1 from distributions d where d.household_id = h.id and d.distributed_at >= $4::date))
     order by l.code, g.last_name nulls last, g.first_name`,
    [f.channel, f.locationId ?? null, f.language ?? null, f.visitedSince ?? null],
  );
  const lines = [COLUMNS.map(cell).join(",")];
  for (const r of rows) {
    const tags = ["Friends of Literacy", r.location_name, r.language].filter(Boolean).join(", ");
    lines.push(
      [r.email, r.first_name, r.last_name, r.phone, r.zip_code, r.language, r.card, r.location_name, r.children, r.last_visit, tags]
        .map(cell)
        .join(","),
    );
  }
  return { csv: lines.join("\r\n") + "\r\n", count: rows.length, filters: f };
}
