# Story Garden Free Bookstore — User Journeys

User journeys and screen decisions for the existing hackathon web app. Sources include the two-page Friends of Literacy project packet, the Libib and DYMO screenshots, and workflow decisions from this discussion.

## Goal and scope

The core journey is a staff-assisted checkout for free books that local families keep. Registration and library cards establish which household receives the books. Inventory and reporting support that checkout. Help the program director understand who the bookstore serves, how often households visit, and what reading barriers families report. The free bookstore serves families in East Knoxville.

| Source | What it establishes |
| --- | --- |
| Project packet | Track ZIP code, household information, visit frequency, reading barriers, and inventory. The packet mentions five book categories. Track book language and distinguish new from used. New books can be reordered when low. The process needs to support Spanish-speaking families, who account for around half of clients. Staff and volunteers need a simple workflow and there is no budget. Client satisfaction and accessibility feedback are bonus scope. |
| Current process | Staff or volunteers register families at checkout. Libib links household members by email and stores details such as birth months in notes. Staff scan books out for an extended loan period even though families keep them. The current tools are paid Libib and Google Sheets. The screenshots also show DYMO label printing. |
| Confirmed workflow decisions | Staff start each visit and open registration for new Patrons. Patrons fill out bilingual signup and the required initial survey on an in-store laptop. Admin staff take over after submission. Staff can scan books with the existing scan gun. It supplies the ISBN, and the app uses an ISBN lookup API to retrieve the title. Staff can also tally uncatalogued books at pickup. Each household has one checkout identity. The primary contact and each registered child can receive a physical copy of the household card. Checkouts and survey history are tracked at the household level. |
| Checkout and follow-up | A completed checkout of at least one book counts as one visit. Staff can enter the household account number manually if a card is unavailable. A dismissible follow-up survey becomes due every three months and is offered during checkout. |

### People using the app

- **Patron** registers, answers surveys, presents a card and books, asks to update household details, or requests a replacement card.
- **Admin staff** handle checkout, household records, and cards. Inventory and reporting are supporting admin functions.

## Current bookstore setup

These screenshots document how staff work today. Use the category dropdown as the source for the observed collection labels. The target journeys describe the work the app needs to support. The screenshots document collection labels and the existing printer setup.

- **Card making** — Libib displays a patron barcode. Staff enter that identifier in a DYMO label template and print it with a LabelWriter 4XL. The screenshot shows Code 128. Confirm barcode compatibility with the existing printer and scanner before launch.
- **Book intake** — Staff choose a collection and can look up a book by ISBN. The book record shows the publisher ISBN and a separate Libib barcode for the physical copy.
- **Checkout** — Staff find the patron by barcode, name, or email and find books by barcode or title. Libib accepts several books in one checkout and displays a success confirmation. The 999-day loan is the current workaround for books families keep.

### Book collections shown in Libib

The dropdown shows six categories across two languages and two conditions, for 24 collections. The packet says five categories. Use the six observed labels as the starting point and confirm which belong in launch reporting. The table preserves the current dropdown wording, including spelling and singular/plural differences.

| Book category | New · English | New · Spanish | Used · English | Used · Spanish |
| --- | --- | --- | --- | --- |
| Adult | New English Adult Books | New Spanish Adult | Used English Adult | Used Spanish Adult |
| Board Books | New English Board Books | New Spanish Boardbooks | Used English Board Book | Used Spanish Board Book |
| Chapter Books | New English Chapter Books | New Spanish Chapter Books | Used English Chapter Book | Used Spanish Chapter Book |
| Early Readers | New English Early Readers | New Spanish Early Readers | Used English Early Reader | Used Spanish Early Reader |
| Picture Books | New English Picture Books | New Spanish Picture Books | Used English Picture Book | Used Spanish Picture Book |
| Young Adult | New English Young Adult | New Spanish Young Adult | Used English Young Adult | Used Spanish Young Adult |

The screenshots show one English–Spanish bilingual title filed under New Spanish Boardbooks. Confirm the classification rule for bilingual books before making it a reporting rule. The target app can store category, book language, and condition as separate fields while retaining the bookstore’s grouping.

## Four Patron journeys

**Patron** is Story Garden’s term for a person it serves. The Patron uses the in-store laptop for registration and surveys. The admin uses the app to look up accounts, manage cards, and check out books.

### 1. New Patron — register and complete the first survey

**Trigger** — A mother and her children browse Story Garden, choose books to take home, and come to the counter for their first visit.

1. Staff start the visit, open the new-household form, and swivel the in-store laptop toward the mother. She chooses English or Spanish, with staff there to help.
2. She enters her information as primary contact and head of household. Require a phone number or both a name and an email address. Either contact route is sufficient, and she can provide both. Use first name as the minimum for the name field when it is required. Last name, ZIP code, and birth month and year are optional.
3. She can independently opt in to email or text messages for the contact methods she provides. Keep both permissions optional and off by default.
4. She can add children by first name, last name, and birth month and year. She can also add another caregiver to the same household. She remains the designated primary contact. Confirm what information to collect about another caregiver.
5. She completes the required quick on-screen survey and submits her household information and responses. The initial survey is part of registration and has no Skip action. The app saves the household, generates its unique barcode, and timestamps the survey submission.
6. She swivels the laptop back to staff.

| Initial survey prompts |
| --- |
| How did you hear about Story Garden? |
| Why did you decide to visit? |
| About how many books are in your home? |
| How many days or nights do you read to or with your children? |
| Does your child enjoy reading? |
| How else can we help? |

**Admin handoff** — The Patron hands the laptop back after submission. Staff use the generated household barcode to print labels in the separate label-printer app. They can also finish checkout before printing by manually entering the household account number. The primary contact and each registered child receive a physical copy of the household card, all with the same barcode. See A3 for printing the cards and A1 for checkout.

### 2. Returning Patron — present a card and books

**Trigger** — A Patron chooses one or more books to take home and brings them to the counter.

1. The Patron hands over their library card and the selected books.
2. If household details have changed, the Patron tells the admin. Examples include adding a child, changing a ZIP code, or correcting existing information.
3. The admin takes over. Scanning the primary contact’s or a child’s card opens the same household. The admin scans the books’ ISBN barcodes and records them against that household. See A1 for admin checkout.
4. If staff see that a follow-up survey is due during checkout, continue to Journey 3. If the Patron lost the card, continue to Journey 4.

**Success** — The Patron receives the books to keep. The checkout and household changes are recorded on the household account.

### 3. Returning Patron — complete a follow-up survey

**Trigger** — The household is checking out one or more books and three months have elapsed since its initial survey or latest completed follow-up survey. The app shows staff that the survey is due before they finalize checkout.

1. Staff offer the survey before finalizing checkout. If the Patron agrees, staff open the survey and swivel the laptop toward them.
2. The Patron submits the survey and hands the laptop back. If they decline or want to do it later, staff dismiss the prompt for the current checkout. Either action returns staff to the active checkout with the same household and books.
3. On submission, the app saves the responses and timestamp against the household, preserves previous responses, and starts a new three-month cycle. Dismissing the prompt leaves the survey due for the next checkout with books.

| Follow-up survey prompts |
| --- |
| How would you rate your visits over the last X months on a scale of 1 to 5? |
| About how many books are in your home? |
| How many days or nights do you read to or with your children? |
| What else would you like to see at Story Garden? |

**Success** — Survey status belongs to the household. A completed survey sets the next due date three months later. Dismissal leaves the due date in place.

### 4. Patron with a lost card — ask for a replacement

**Trigger** — A Patron arrives and tells the admin they lost their card.

1. The Patron requests a replacement at the counter and provides enough information for the admin to locate the existing household.
2. The admin takes over to verify the match and issue a replacement. The Patron waits while staff handle it.
3. The Patron receives a reprint of the same household barcode and can continue checkout.

**Success** — The reprint opens the same household, checkout history, and survey status. See A3 for replacement printing. Staff can look up the household using the contact details on file.

## Seven admin journeys

### A1. Check out books to a household

**Trigger** — A Patron presents a library card and the books they want to take home.

1. Scan a physical copy of the library card or enter the household account number manually. Keep the newly registered account available for manual checkout if a card is still being printed or the printer is unavailable.
2. Scan each book’s ISBN. Use the ISBN lookup API to retrieve the title when needed and match the scan against local stock. If the same title has multiple matching stock entries, choose the correct collection and condition. Review quantities and correct or remove any line before finalizing.
3. If a book is absent from inventory or its matching stock entry is at zero, use **A5. Quick-add a book during checkout** on the same screen. For intentionally uncatalogued stock, record quantity against the relevant collection tally. Manual ISBN or title search remains available if scanning or lookup fails.
4. When at least one book is on the list, flag a due follow-up survey to staff before they finalize. Staff offer the survey or dismiss the prompt for this checkout.
5. Select **Checkout**. The app saves one visit and its distribution lines, associates them with the household, and updates stock in the same save. Show a confirmation and clear the completed checkout for the next Patron.

**Success** — The household receives the books to keep. A finalized checkout with one or more books counts as one visit. An empty book list cannot be checked out. Retrying a completed checkout keeps the visit and stock deductions from being recorded twice. If another checkout has already used the available stock, keep the current checkout open and show which line needs attention.

### A2. Update a returning household

**Trigger** — A Patron asks to add a child or another caregiver, update a ZIP code, or correct an existing detail.

1. Open the household from the scanned card or verified lookup. If a checkout is in progress, keep the selected household and book list available.
2. Update the relevant person or household field. For a new child or caregiver, add a linked person to the existing household. The current primary contact stays in place when another caregiver is added.
3. Save the changes. If a newly registered child needs a card, continue to **A3. Print a new or replacement library card**. Return to the same checkout if one was in progress.

**Success** — The household, its cards, and its survey and checkout history remain linked after the update.

### A3. Print a new or replacement library card

**Trigger** — A Patron submits first-time registration, a child is added to an existing household, or a Patron reports a lost card.

1. Open the submitted registration or look up the existing household. A new household receives one unique barcode. For an added child or a lost card, use the household’s existing barcode.
2. Copy the household barcode from this app and paste it into the label template in the separate printer app. Print one physical copy for the primary contact and one for each registered child at initial issuance. Print one additional copy for a newly added child or one replacement for a lost card.
3. Hand the cards to the Patron. If printing fails, staff can finish checkout by entering the household account number and reprint later with the same barcode.

**Success** — All physical copies scan to the same household. Reprinting uses the existing barcode and preserves household checkout history and survey status.

### A4. Add new or used books to inventory

**Trigger** — Staff receive a shipment of new books or a donation of used books.

1. Scan the ISBN. The app finds an existing title or looks it up through the ISBN API. Staff confirm the title. If the lookup returns no title, staff can enter it manually.
2. Select the collection from the dropdown using the category, book language, and New or Used condition. Use the collection labels in the reference above. When the same ISBN is stocked in more than one collection, choose the collection for the copies being received.
3. Enter the quantity of copies of that title in the selected collection. For example, add 30 copies of one title as a single intake. Record other titles or different collections separately.
4. Save the intake. If that ISBN and collection already have stock, increase their quantity. Otherwise, create the stock entry. For books intentionally managed as uncatalogued stock, use the relevant collection tally.

**Success** — Inventory shows the added quantity under the right collection. Receiving more copies of an existing edition preserves its prior stock and distribution history.

### A5. Quick-add a book during checkout

**Trigger** — A Patron wants to take home a physical book that has no matching local stock record or whose matching stock entry shows zero available copies.

1. Open a quick-add form from the scan result. Keep the household and books already scanned in the active checkout.
2. For a registered title at zero stock, use its existing title and collection record. For an unregistered title, use the scanned ISBN and the title returned by the lookup when available, or enter the title manually, then select a collection. Quick-add records one physical copy going home.
3. Save the quick entry and return to the same checkout with the book on the list. Finalize with the rest of the books through A1.

**Success** — When checkout is finalized, the app logs one copy added and one distributed under the selected title and collection, with a net stock change of zero. Draft quick-add entries leave stock unchanged until checkout is finalized. Use A4 to add copies for the shelf.

### A6. Review inventory, distribution, and survey reports

**Trigger** — Admin staff need to decide what to reorder, understand which books are going home, or assess who Story Garden serves.

1. Open the dashboard. Choose a date range for activity and survey metrics. Filter by collection, category, language, or condition where applicable. Show current stock as an on-hand count.
2. Review the views below. Drill down to specific titles, collections, or households where the app supports it.
3. Use current new-book stock and distribution activity to decide what to reorder. Previously stocked titles remain visible even at zero on hand.

| Admin question | Report |
| --- | --- |
| What is in stock, and what should we reorder? | Current copies on hand by title and collection, split by New and Used. Review low and zero balances against distribution activity. Reorder thresholds are open. |
| What is going home, and what is staying on the shelf? | Total copies distributed, checkouts, most frequently distributed titles, collection totals, and an “Items not lent” view. That view shows current on-hand stock for titles with zero checkouts in the selected date range, within any applied collection filters. |
| Who is using Story Garden, and how often? | Households served, visits, distribution quantities per household, and household ZIP code where provided. Count one visit per finalized checkout with at least one book. A household with two visits counts once in the household total. |
| How many children are we reaching? | Registered child count and broad age ranges derived from available birth month and year data. Report unknown ages separately. Report checkout activity at the household level. |
| What are Patrons telling us? | Initial and follow-up survey response counts, reading habits, books at home, follow-up ratings, and feedback. Keep initial and follow-up answers distinguishable. Show how many responses each summary uses. |

**Success** — Counts can be traced to saved checkout, inventory, household, or survey records. A book distributed to a Patron contributes to distribution metrics. Ordinary checkout reduces on-hand stock, and a quick-added copy has a net stock change of zero. A book taken out of circulation for another reason reduces stock and is recorded in inventory adjustments.

### A7. Remove books from circulation (potential)

**Trigger** — Staff find damaged or missing copies, or decide to withdraw books that have gone unused.

1. Scan the ISBN or search for the title or collection tally. Select the exact stock entry to adjust.
2. Enter the number of copies to remove and select a reason, such as damaged, missing, or withdrawn after low use. Review the new balance before confirming.
3. Confirm the removal. The app records the quantity, reason, and date and updates available stock. For a missing copy, staff can use search because the physical book may be unavailable.

**Success** — On-hand stock reflects the change and the adjustment is visible in inventory history. Checkout history and books-distributed totals retain their previous counts.

## Handoff notes for the app builder

- **Screen mapping** — Build these flows into the existing app. See the screen review below for decisions on the landing screen, laptop handoffs, checkout states, and admin surfaces.
- **ISBN lookup** — Send only the ISBN to the book metadata API. The result identifies the title. The bookstore’s own stock records determine available quantities, category, language, and whether the copies are new or used. A successful lookup does not create stock or complete a pickup.
- **Suggested records** — Households with a designated primary contact, linked children and caregivers, one checkout barcode per household, initial and follow-up survey submissions, visits, distribution entries, title-level and uncatalogued stock, reason-coded stock adjustments, and dated answers. Each distribution entry points to one stock entry. Category, language, and condition determine how stock and distribution totals roll up.
- **Language** — Provide English and Spanish family-facing signup and reading prompts with a language switch that preserves progress. Keep the app’s prompt language separate from the language of a book. Have the nonprofit review the family-facing Spanish copy before live use.
- **Client data** — Use synthetic data in the demo and any AI tools used to build or test it. Keep sensitive client information out of AI prompts and runtime AI services. Restrict household records and household checkout reports to authorized staff. Use aggregate views for general program reporting. Confirm access and approved data collection before live use.
- **Budget and existing data** — Assume zero paid services for the demo. Libib and Google Sheets describe the current workflow. Confirm any import or ongoing integration before adding it to the build.
- **Demo walkthrough** — Register a synthetic household in Spanish with a phone number and the initial survey, add a child and another caregiver, and confirm the original registrant stays the primary contact. Simulate printer downtime and check out one scanned book and one tallied book using the household account number. Verify the survey prompt appears during checkout three months after the initial survey. Dismiss it, confirm it returns on the next checkout with books, then submit it and verify the next due date is three months later. Reprint a lost card and verify that it uses the same barcode and shows the same checkout and survey history. Add 30 new copies of one title and remove one damaged copy. Exercise quick-add for both an unregistered title and a registered title at zero stock. Verify that each contributes one distributed copy and leaves no extra stock, and that the existing title record is reused. Check that the “Items not lent” view shows an in-stock title with zero checkouts in the selected date range.

## Screen decisions for the existing app

Use this review to map the journeys to the app’s current pages, forms, and data. Reuse the app’s existing navigation and records where they support the journeys. The surface names below describe what staff and Patrons need to see. Confirmed workflow rules appear in the journeys. Suggested layouts and remaining decisions are called out below.

| Area | Screen or state | Behavior and open details |
| --- | --- | --- |
| Counter landing | Staff start each visit. | Use staff-facing **Checkout** as the default, with a card scan or manual account-number field, **New household**, and **Find household**. Staff open the Patron form and swivel the laptop. |
| Patron signup | Decide how to group primary contact, children, another caregiver, and the first survey. Define required fields, review, and what Back or Cancel does. | Two short steps, **Household** then **Quick survey**, in English or Spanish. Preserve entries when going Back or changing language. Require a phone number or a name and email, then require the initial survey submission. Confirm which individual answers are required, the minimum fields for added people, and which questions apply to households without children. If a Patron discovers they already have a card mid-form, staff need a way back to household lookup. |
| Swivel back to staff | Decide how the app moves from the Patron form to the newly created household while keeping the staff workspace out of the Patron view. | Show **Ready for staff** after submission. Staff resume on the specific household that was just created, with its barcode ready to copy and checkout available. Confirm how staff resume using the app’s existing access model, and what happens if a Patron leaves during signup. |
| First checkout and label printing | Continue checkout even if printing is unavailable. | Keep the new household available through printing and checkout. Staff copy its barcode into the separate label-printer app and can enter the account number manually to complete checkout. |
| Returning lookup and replacement | Use contact details on file when a card is unavailable. | Start with **Find household** from checkout. Staff look up the household using the name, email, or phone details on file. On the selected household, provide **Start checkout**, **Edit household**, and **Copy barcode** for a reprint. |
| Checkout scan and recovery | Specify how the scanner changes from household barcode to ISBN mode, and what staff see if an ISBN has several stock matches, returns no title, or matches a title with zero stock. Decide what happens if staff change households or discover a mistake after checkout. | Show the selected household and current books throughout the scan. Use a visible book-scan field after selecting a household. A single matching stock entry can be added directly. Ask staff to choose when collections differ. Preserve the list through edits and quick-add. Use the same quick-add for a physical book with a zero balance. Confirm whether correcting completed checkouts is in scope. |
| Follow-up survey | Offer the survey during checkout once it is due on the three-month clock. | Show staff the due prompt before they finalize a checkout with books. Staff open the Patron screen or dismiss the prompt for this checkout. After Submit, show **Ready for staff**. Return to the same household and book list in either case. |
| Survey controls | Set answer types, response choices, reading-time wording, and the follow-up rating period. | Use the same time period and response scales for questions that repeat. A proposed reading frequency control is **days in a typical week**, from 0 to 7. Confirm how to ask about the number of books at home and what to put in place of “X months.” |
| Inventory and quick-add | Decide how the collection is selected, how books without a usable ISBN are recorded, and which intake values remain after a save. | Start from the observed collection list. Keep **Quick-add** inside checkout with title and collection for one copy. Use full intake for quantities going to the shelf. Confirm whether the collection selection stays in place for the next title and how bilingual or uncatalogued books are classified. |
| Dashboard and removal | Decide which reports need their own destination or filters and whether removal from circulation is in the screen build. | Use the app’s existing dashboard where possible. Label current stock separately from date-filtered activity. Confirm whether child counts mean total registered children or children in households that visited during the date range, and which age bands to use. Confirm first-release scope for removal and any automatic low-stock threshold. |
| Existing app | Identify current pages and routes, shared staff session behavior, and which records or integrations are already available. | Share the current navigation or route list if the coding agent cannot inspect the app directly. Confirm which flows already work end to end, especially barcode scanning, registration, and inventory lookup. |

## Additional decisions before live use

| Decision | Needed to finalize |
| --- | --- |
| Book categories and bilingual titles | Confirm the six observed categories for launch reporting and how to classify bilingual titles. |
| ISBN lookup provider | Select an API that fits the zero-budget constraint. The demo requires title retrieval by ISBN and a manual fallback. |
| Survey copy | Approve household and survey wording in English and Spanish. |
| Existing records | Decide whether the first live version starts fresh or imports approved records from Libib and Google Sheets. |
