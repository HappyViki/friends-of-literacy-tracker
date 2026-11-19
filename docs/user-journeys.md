# User journeys: Story Garden

How families and staff move through the app, what supports each step today, and what's still open.
The surveys come from the program team (Story Garden: first visit / returning visitors). "Benchmark"
questions are required and tracked over time; the others are optional.

Legend: ✅ in place · 🆕 added for these journeys · ⏳ open (not built)

## 1. A family's first visit

| Step | Who | What the app does | Status |
| --- | --- | --- | --- |
| Arrives; staff search by name/phone to be sure they're new | Staff | Front desk search (card, email, phone, typo-tolerant name). Duplicate email/phone is refused at sign-up and shows the existing family. | ✅ |
| Sign up | Staff (with family) | New family: adults (up to 4), children (birth year/month or age), ZIP, home languages, consent to contact. | ✅ |
| Library card | Staff | Card number issued at the location, printable card with barcode. | ✅ |
| First-visit survey | Family, with staff | "Next steps" opens **Story Garden: first visit**. Opens in Spanish when the parent prefers Spanish. Books at home, reading days a week, enjoys reading (1–10) are required; how they heard / why they came / resources are optional. "If other, how did you hear?" appears only when "Other" is ticked. | ✅ 🆕 (wording, "other" follow-up) |
| Give books | Staff | Scan ISBNs into a basket (new/used, which child); stock checked per location. | ✅ |
| If the survey was skipped | Staff | Family page banner and front-desk badge say the first-visit survey isn't done; the giveaway confirmation reminds staff while the family is still there. | 🆕 |

## 2. A returning visit

| Step | Who | What the app does | Status |
| --- | --- | --- | --- |
| Scan card | Staff | An active card goes straight to the family page; a lost card still finds them, with a warning. | ✅ |
| Is a survey due? | Staff | **One rule everywhere:** first-visit survey until answered; then **returning visitors** once their latest survey is older than `RETURNING_SURVEY_EVERY_DAYS` (default 90, since the survey asks about "the last few months"). Shown as a family-page banner + primary button, a front-desk badge, and a prompt after giving books. | 🆕 |
| Returning-visitors survey | Family, with staff | Visit rating (1–5), books at home, reading days, enjoys reading (1–10), ideas. | ✅ |
| Give books | Staff | Same basket; history shows reading level and language per book. | ✅ |
| Add a second parent who came this time | Staff | "Add an adult" (up to 4). | ✅ |

## 3. Program coordinator: follow-up and reporting

| Need | What the app does | Status |
| --- | --- | --- |
| Who still needs a survey | Admin → Missing surveys. First visit: visiting families who never answered. **Returning visitors: families due under the 90-day rule**, with their last survey date, CSV download and "Take survey" links. | ✅ 🆕 (due rule) |
| Benchmarks over time | Reports: average reading days, enjoys reading, visit rating, each with first vs. latest for returning families ("3+" counts as 3). | ✅ |
| How families heard about us | Reports chart from the multi-choice answers. | 🆕 |
| Families asking for help / ideas | Reports → "What families told us": latest answers to resources, ideas, why they came, "other", each linking to the family. | 🆕 |
| Anything else | Admin → Build your own reports (Excel/Sheets workbook, survey answers one row each). | ✅ |
| Outreach | Admin → Export contacts (Mailchimp CSV, consenting adults only). | ✅ |

## 4. Admin: people and access

| Need | Status |
| --- | --- |
| Add an intern with a password, reset it, remove access when they leave | ✅ |
| Staff sign in with Google | ⏸️ Off. Needs the organization's own Google OAuth client; then restore the button in `web/src/pages/Auth.tsx` and enable Google in Neon Auth |

## Open (⏳), roughly by value

1. **Self-serve survey on a tablet** — hand the tablet to the parent: big buttons, no staff menus, locks back to staff when done. Removes staff transcription and shortens lines at busy events.
2. **Pop-up events with poor signal** (farmers market) — the app needs a connection; an offline queue for giveaways/surveys would make tent days reliable.
3. **Edit or remove an adult/child**, and let staff change their own password.
4. **Follow-up workflow for resource requests** — mark a "how else can we help" answer as handled, and by whom.
5. **Reports page dates in the organization's time zone** (the Excel export already is; the Reports page groups by UTC).
6. **Production rollout** — production Vercel site, `ALLOWED_ORIGINS` and Neon Auth trusted domain for it, custom email sender, `ORG_TIMEZONE`.
7. **"Benchmark" as a property of a question** (today: required). If benchmarks need their own reporting rules, make it explicit.
