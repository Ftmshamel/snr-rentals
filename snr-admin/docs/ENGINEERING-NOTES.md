# Engineering notes — traps, incidents, and why things are the way they are

Written 2026-09-14. Companion to `SnR_Rentals_App_Status.md` (which describes
*what the app is*); this file describes *what will bite you*.

> **Since Oct 2026 the app runs on Firebase (Firestore)** — see §0. §1–§4
> describe the legacy MongoDB/Supabase setup, which still holds the real
> historical data and must not be touched.

If you are an agent or developer picking this codebase up, read
**[§0 Firebase](#0-firebase-the-current-database)** and then
**[§1 The dual-database split](#1-the-dual-database-split--read-this-first)**
before touching anything that writes data. It is the source of the most
serious bug this project has had.

> **This file is maintained, not archived.** Update it in the same change as the
> work — new incident → §4, new/changed script → §5, new trap → §7 or §8. See
> the table in `CLAUDE.md`. Stale documentation here is worse than none, because
> the whole point of this file is that the traps below are invisible in the code.

---

## Contents

1. [The dual-database split — read this first](#1-the-dual-database-split--read-this-first)
2. [Historical data: prices and stock change over time](#2-historical-data-prices-and-stock-change-over-time)
3. [Analytics: what it does and does not compute](#3-analytics-what-it-does-and-does-not-compute)
4. [Data incidents and repairs (May–Sept 2026)](#4-data-incidents-and-repairs-maysept-2026)
5. [Scripts: what each one is for](#5-scripts-what-each-one-is-for)
6. [Deployment constraints](#6-deployment-constraints)
7. [Known open issues](#7-known-open-issues)
8. [Conventions worth not breaking](#8-conventions-worth-not-breaking)

---

## 0. Firebase — the current database

`DATASOURCE=firebase` (default). One store, so there is no mirror to fail and
the §1 problem cannot happen: `/api/bookings/by?type=unmirrored` returns `[]`.

| Collection | Holds |
| --- | --- |
| `bookings/{responseId}` | booking in the frontend's SCREAMING_SNAKE shape (`toMongoFormat`), no images |
| `bookings/{id}/documents/{field}` | one uploaded image per doc (`{ value }`) — kept out of the booking because Firestore caps a document at 1 MiB and list views must stay small |
| `expenses/{autoId}`, `date_notes/{YYYY-MM-DD}` | as before |
| `cameras/{slug}` | the catalogue — `lib/catalog.js` documents the shape |

- **Started empty on purpose.** The owner decided not to migrate; MongoDB and
  Supabase keep the real history. Nothing in firebase mode loads their clients
  — verified by a test that fails if `mongodb`/`@supabase/supabase-js` is
  required.
- **Re-submission keeps admin fields.** `upsertSubmittedBooking` never
  overwrites `NOTES`, `DOWNPAYMENT_PAID`, `FULFILLMENT_STATUS`, half-day flags
  or `_createdAt`; a cancelled booking stays cancelled.
- **Reads load the whole `bookings` collection** and filter in JS (Firestore has
  no case-insensitive match). Fine at S&R's volume; revisit (indexes on
  `status`, stored upper-case names) if bookings reach the thousands.
- **Catalogue edits keep history.** `applyCameraUpdate` moves the old rates /
  unit count into `priceHistory` / `unitHistory` with the chosen effective
  date, refuses a date earlier than the last recorded change, and refuses
  renames (bookings reference cameras by name). Add-on **prices** have no
  history yet — changing one reprices old bookings when they are edited.
- **Admin login (2026-10-14): hashed passwords, signed expiring sessions.**
  `api/auth/login.js` checks the password against a scrypt hash from the
  environment (`OWNER_PASSWORD_HASH`, `ADMIN_PASSWORD_HASH`; usernames
  `OWNER_USERNAME` / `ADMIN_USERNAME`, default `owner` / `admin`) and returns a
  JWT (HS256, `lib/session.js`) signed with `AUTH_SECRET` that carries the
  role and expires after 12 h. `lib/auth.js` `requireAuth` / `requireOwner`
  verify it, so owner-only writes are enforced server-side and a staff token
  can't be edited into an owner one. Login is rate-limited (8/min per
  address). **Nothing has a default:** with no `AUTH_SECRET` or no hashes,
  login answers 503 "isn't set up" — set them on the API's Vercel project
  before deploying. `node scripts/hash-password.js` makes a hash (and
  `--secret` an `AUTH_SECRET`). The hash format is `scrypt:N:r:p:salt:hash`
  in base64url — no `$`, so it pastes safely into PowerShell or bash. The old
  plaintext passwords and fixed tokens are gone from the code but remain in
  this public repo's git history: never reuse them.
- **Data privacy (RA 10173), 2026-10-14.** The public site has `/privacy`
  (policy + request form). `POST /api/public?action=privacy-request` takes a
  reference code + the contact number on that booking as proof, and queues
  `privacy_requests/{id}` `{ type: access|correction|deletion, ref, refs[]
  (every camera of the order), details, status, resolution }` — the contact
  number itself isn't stored on the request. The owner works them on the
  admin's `/privacy` (`GET|PATCH /api/bookings/by?type=privacy`). **Erasure**
  is `DELETE /api/bookings/{id}?mode=erase` (owner only,
  `erasePersonalData`): refused unless the booking is completed, cancelled or
  rejected; deletes the documents sub-collection (IDs, selfie, billing,
  payment proof, signature) and blanks name, contact, address, Facebook,
  delivery/return details, rider route and the member link, but keeps dates,
  camera, serial, fees and status for the books; stamps `ERASED_AT` and a
  `personal_data_erased` timeline event. An erased booking can no longer
  verify a repeat renter. A plain `DELETE` still deletes the whole booking.
- **Rental lifecycle is enforced server-side.** `applyLifecycle` validates
  every `status` / `FULFILLMENT_STATUS` change (see `CLAUDE.md` → "Rental
  lifecycle and serial numbers") and appends to `TIMELINE`. A PATCH that jumps
  steps — e.g. `{status:"completed", FULFILLMENT_STATUS:"returned"}` on a
  booking never released — is refused with a 400 and a readable reason
  (`LifecycleError`). Scripts that change statuses must walk the steps.
- **Serials identify physical units across the whole catalogue** (unique
  across cameras). Bookings released before a camera had serials have no
  `UNIT_SERIAL`; that is expected, not an error.
- **The server assigns the unit** (`lib/unitAssignment.js`, called from
  `assignUnit` in `firestoreQueries.js`). Approving a booking — or creating
  one already approved — gives it a unit free for its dates: its current
  one if it still fits, else the unit idle longest. Changing dates or camera
  re-checks it; cancel / reject / back to pending frees it. Staff can swap
  it until release (PATCH `UNIT_SERIAL`; `"auto"` hands it back), and a
  swap or release onto a unit another rental holds for overlapping dates is
  refused. A unit that is out and **overdue** counts as busy for every date
  until it is marked returned. "Busy" uses the same window as availability
  (back-to-back at the same hour is not an overlap). Every change is a
  `unit_assigned` timeline entry; the renter's Track page never shows it.
  If no unit is free the booking stays unassigned with a note — availability
  normally prevents that, but a manual booking or a retired serial can cause it.
- **Delivery details are validated server-side** (`lib/delivery.js`): a new
  public delivery booking needs receiver, number, address and a pin inside
  the Philippines; anything else is a 400 the renter sees. Lalamove links
  must be full http(s) URLs. The renter can change `RETURN_DETAILS` through
  `/api/public?action=return-details` only until `LALAMOVE_RETURN_LINK` is set.
- **Lalamove API orders**: booking a delivery releases the unit first (all
  lifecycle checks run) and rolls the release back if Lalamove refuses, so a
  failed order never leaves a unit marked out. Status is polled on demand
  (throttled to 30 s per order), not pushed — a webhook would need its own
  route, and every function slot is used. Phones are sent to Lalamove as
  E.164 (`+63…`).
- **Rider map**: each order stores `route { from, to }` (the trip's two pins)
  when booked, and `driver.location` from Lalamove's driver endpoint (re-read
  on every sync while the order is active). The Track page draws them with
  Leaflet (`snr-client/src/components/RiderMap.jsx`); the public view sends
  coordinates only, never the stop labels. A **simulated** sandbox order
  places the rider itself: near the pickup pin while "on the way", on the
  sender's pin once picked up, on the recipient's pin once dropped off. The
  delivery map stays on the Track page after drop-off until a return rider
  is booked. Lalamove's own share-link page can't show a simulated rider.
- **Member tiers (S&R Rewards)** — `lib/loyalty.js`. Renters may sign in
  with Google on the public site (Firebase Authentication, optional; guests
  still book). Their tier (Bronze 0 / Silver 3 / Gold 6 / Platinum 10
  completed rentals by default; owner edits them on `/rewards`, stored in
  `settings/loyalty`) is counted from bookings carrying their `RENTER_UID`
  that are `completed` or `returned`. Rules worth knowing:
  - **The server decides the tier and the price.** The client sends its
    Firebase ID token as `RENTER_TOKEN` (never stored) and the fee *before*
    perks; `api/submit` verifies the token, computes the perks from the
    catalogue (`perksForBooking`) and stores `RENTAL_FEE` **net** — so
    Analytics shows what was charged. An invalid token is a 401, not a
    silent full-price booking.
  - Perks are **frozen on the booking** as `MEMBER { tier, discountPercent,
    freeAddons, priority, discount, freeAddons[], savings, … }` on insert
    only: a later tier change or a resubmission never reprices a rental.
    The admin's fee recompute (`BookingModal` `computeAutoFee`) re-applies
    the frozen perks, so editing dates keeps the member price.
  - Discount is on the **camera** fee; free add-ons are the most expensive
    ones picked, and stay in the add-on list (they still leave the shop).
  - `memberPerks` exists in three copies — backend `lib/loyalty.js`, admin
    `utils/loyalty.jsx`, client `src/utils/loyalty.js`. Keep them identical.
  - Past bookings join an account by reference code (`?action=claim`, the
    code is the credential as on `/track`); one already linked to another
    account stays theirs. Linked bookings count toward the tier but get no
    retroactive discount.
  - Platinum's "priority" sorts their requests first on `/approvals`.
  - Collections: `renters/{uid}`, `settings/loyalty`.
- **Multi-camera bookings (one reference code, several cameras)** — added
  2026-10-14. The public form's "Add another camera" sends the extra cameras
  as `ORDER_ITEMS: [{ camera, addons, rentalFee, contractUnit, contractTerms }]`;
  `api/submit` splits the order into **one booking per camera** — the first
  keeps the code (`responseId = ref`), the others are `<ref>-2`, `<ref>-3`…
  (max 5 cameras) — each with `ORDER_REF` / `ORDER_SIZE` / `ORDER_INDEX`.
  Extras are written first so the code never points at a half-saved order.
  How the money works, and why:
  - **Each camera is its own rental**: own `RENTAL_FEE`, own ₱1,000
    `SECURITY_DEPOSIT`, own serial, contract unit, lifecycle and
    `TOTAL_PAYABLE_BEFORE_RELEASE` (= that camera's fee + its deposit).
    Analytics needs no change — it sums bookings, and each camera is one.
    An extra sent without `rentalFee` is priced from the catalogue.
  - **The rush fee is per order**, inside the first camera's fee only.
  - **The renter pays** Σ fees + ₱1,000 × cameras before release; the
    downpayment is 20% of Σ fees. The form shows it per camera and in total;
    the admin booking window shows "Booked together" with the whole sum.
  - **Member perks**: the discount applies to every camera; the tier's free
    add-ons are *per rental* and an order is **one rental**, so they go to
    the first camera's add-ons and any left over to the next camera's
    (`orderMembers` in `api/submit.js`, mirrored in the form's `priceCamera`).
    Tier counts use distinct `ORDER_REF || responseId` (`completedRentals`),
    so a 3-camera order is 1 completed rental, not 3.
  - Documents are copied to every camera's booking (each opens on its own).
  - **One Lalamove rider per order** (`riderGroup` in `lib/lalamoveBookings.js`):
    booking the delivery from any camera releases every approved, unreleased
    camera of the order and places ONE order, stored on each with `group`
    (their codes). Refused while another camera of it is still pending;
    declined/cancelled ones are left out; any failed release or Lalamove
    refusal rolls every release back. Sync, simulate and cancel apply to the
    whole `group`. The renter's return-pickup change applies to every camera
    still editable.
  - `/track` with any code of the order returns `order: { reference, size,
    items[] }` (camera, stage, unitSerial once released); `me` cards carry
    `order`; claiming one code links the whole order.
  - Admin: "N of M cameras" chip on Approvals / Today rows, "Approve all N
    cameras" on Approvals, and the sibling list in the booking window
    (`utils/order.jsx`, read from the cached `/api/bookings`).
- **The public track view is a whitelist** (`lib/public/track.js` `publicView`):
  no documents, phone numbers or other renters' data. Add fields there
  deliberately. `unitSerial` is included only once the unit is released
  (`out_for_delivery` / `out` / `returned`) — before that staff may still
  swap it, so showing it would promise the wrong camera.
- **No default API URL** in either frontend. The old default was the live
  Mongo/Supabase deployment; a misconfigured build now fails instead of
  writing real-looking bookings into the old database.

---

## 1. The dual-database split — read this first

**Bookings are written to MongoDB. The admin panel reads Supabase.**

```
new booking ──► /api/submit ──► MongoDB        (primary — always written)
                                   └──► Supabase   (mirror — can fail)

admin panel ──► /api/*      ──► dataSource.js ──► Supabase   (DATASOURCE=supabase)
```

The app was originally MongoDB-only. It was migrated to Supabase and
`DATASOURCE=supabase` moved every **read** across — but `api/submit.js` was
never migrated and still writes Mongo first. So:

> **The store that always gets written is not the store anyone reads.**

### Why this matters

If the Supabase mirror fails, the booking is saved, the renter receives a
confirmation, and the admin panel never sees it — no Approvals entry, no
schedule slot, no availability impact, no revenue. It is completely invisible.

This happened three times between 2026-09-01 and 2026-09-13:

| Booking | Created | Noticed |
| --- | --- | --- |
| Ribo GJ (Insta360, Sep 1–10) | 2026-09-01 | 13 days later |
| Mary Joy Salonn (X-T100, Sep 5–7) | 2026-09-04 | after the rental had already happened |
| Mitch Buhat (EOS R50, Sep 14) | 2026-09-13 | the renter chased it up |

The writes themselves were valid — replaying them later succeeded unchanged —
so the failures were transient (timeout / dropped connection / rate limit).
The old code caught the error, `console.error`'d it, and returned success.

### What now guards it (added 2026-09-14)

| Layer | File | Behaviour |
| --- | --- | --- |
| Retry | `backend/lib/mirrorToSupabase.js` | 3 attempts, 300ms → 600ms backoff. Add-on write failures now count as mirror failures (they were previously unchecked). |
| Flag | `backend/api/submit.js` | On final failure sets `_mirrorFailed`, `_mirrorError`, `_mirrorFailedAt` on the Mongo doc, so the failure is queryable rather than lost in a log. |
| Banner | `frontend/src/components/Header.jsx` | Red banner on every admin page listing unsynced bookings, via `GET /api/bookings/by?type=unmirrored`. |
| Recovery | `backend/scripts/restore-unmirrored-bookings.js` | Replays the failed mirror using the same `transformBooking()` the submit route uses. |

**Deliberate design choice:** a failed mirror does *not* fail the submission.
Blocking a real customer because Supabase hiccupped is worse than a booking
needing attention. `/api/submit` returns `{ ok, action, mirrored }`.

### Consequences to keep in mind

- **Never "clean up" Mongo rows that are missing from Supabase without checking
  their age.** Mongo is the only copy of an un-mirrored booking. There are ~25
  genuinely-deleted test rows in Mongo; deleting all divergent rows
  indiscriminately would have destroyed Mitch Buhat's live booking.
- Mongo also retains bookings deleted from Supabase — deletes only hit Supabase
  (`DATASOURCE=supabase`). A future Mongo→Supabase sync would resurrect them.
- Status changes (approve/reject) only write Supabase, so a booking can read
  `pending` in Mongo and `approved` in Supabase. Harmless today because nothing
  reads Mongo, but it means the two stores are **not** interchangeable.

---

## 2. Historical data: prices and stock change over time

`frontend/src/data/cameras.js` is the source of truth and carries two fields
that look redundant and are not. Both exist because this data describes the
**past** as well as the present.

### `priceHistory` — what a camera cost on a given date

Read via `getPricingForDate(camera, pickUpDate)`. Without it, changing a price
today would restate every past rental's fee and shift months-old revenue.

The rate card changed on **2026-08-20**, altering two things at once:

- Day bands went from **2** (1–3 / 4+) to **3** (1–2 / 3–4 / 5+) for *every*
  camera — so a 3-day rental moved down a band.
- Canon G7X Mark III `700/650 → 600/550/500`; Fujifilm X-T100 `600/550 → 550/500/450`.

Every camera therefore carries a `priceHistory` entry, not just those two.
Cameras added *after* that date (Canon EOS R50) correctly have none.

### `unitHistory` — how many units existed on a given date

Read via `getUnitsForDate()` / `unitsOn()`. Availability and the overbooking
warning look at past dates too, so a booking that was fine when you owned more
units would otherwise read as a double-booking.

Real example: **3 Pocket 3s were out on 2026-06-04**, correct at the time
(3 owned). One was sold on 2026-08-20. Under a flat count of 2 this shows as a
false overbooking.

### How to record a change

Do **not** just overwrite the current value. Move the old value into the
history array with the date the change took effect, then update the live value:

```js
units: 2,
unitHistory: [{ before: "2026-08-20", units: 3 }],
```

### Mirrors that must be updated together

| File | Purpose |
| --- | --- |
| `frontend/src/data/cameras.js` | **source of truth** |
| `backend/lib/transformBooking.js` | prices new submissions |
| `backend/scripts/fill-rental-fees.js` | backfills missing fees |
| `backend/api/public-availability.js` | unit counts for the public site |
| `backend/lib/cameraDefaults.js` | **dead code** — see §7 |

---

## 3. Analytics: what it does and does not compute

**Analytics never calculates a fee.** It reads the stored `RENTAL_FEE` and sums
it. `Analytics.jsx` does not import `CAMERAS` at all.

```js
const totalRevenue = eligible.reduce((s, b) => s + Number(b.RENTAL_FEE), 0);
```

This is why every revenue problem in §4 had to be fixed **in the database**, not
in code: a null fee counts as ₱0 silently, a wrong fee shows forever, a
duplicate row double-counts.

Three places *do* calculate, none of which feed revenue directly:

| Where | Purpose | Writes? |
| --- | --- | --- |
| `transformBooking.autoCalcFee` | prices a new booking at submission | yes — sets `rental_fee` |
| `BookingModal.computeAutoFee` | suggests a fee while editing | only on Save |
| `RentalsReport.computeExpectedFee` | flags stored-vs-expected mismatches | never |

### Status filters differ on purpose

- **Analytics** excludes `pending`, `rejected`, `cancelled` — an unapproved
  booking has earned no revenue.
- **Availability** (`utils/availability.js`) excludes only `cancelled`,
  `rejected` — an unapproved booking still occupies the camera.

Unifying these two lists into one constant will silently break one of the pages.

### The delivery rider cut is gone

`calcDeliveryCut` used to derive the rider's share from each booking's pick-up
date and subtract it from revenue. S&R no longer uses riders. The ₱13,600 that
was actually paid out (May–June 2026) now lives in the **expenses** table as one
row per delivery, prefixed `Rider cut — `, so it still reduces net income
through the normal expense path. Verified value-neutral: net income was
identical before and after, every month.

`SnR_Rentals_App_Status.md` §"Delivery rider cut" is **stale** — it still
documents the removed behaviour.

### Month scope

The Months tab defaults to current + previous month with a **Recent / All
months** toggle. A hard 2-month cut was tried and reverted: it hid 82% of
revenue and made the Months tab contradict the all-time Overview (expenses are
all dated May–June, so the tab showed ₱0 expenses against ₱15,069 all-time).
`byMonth` always holds full history so growth deltas compare against real prior
months even when only two are listed.

---

## 4. Data incidents and repairs (May–Sept 2026)

Chronological, with the script that fixed each. **All repair scripts are
dry-run by default, idempotent, and write a backup to `database-backups/`.**

### 4.1 Delivery cut → expenses (2026-09-03)

Moved ₱13,600 across 65 deliveries from a derived deduction into expense rows.
`migrate-delivery-cuts-to-expenses.js`. Net income unchanged.

### 4.2 Historical rate card correction (2026-09-03)

19 bookings in the 2026-05-30 → 2026-08-19 window had been priced on the *new*
3-tier card. Corrected to the 2-tier card in force at the time: **+₱3,050**.
`fix-historical-rate-card.js`.

Key subtlety: **billing shape is not consistent across that window.** May–June
bookings were billed camera-only (add-ons not charged); July–August mostly
include add-ons; some carry a ₱300 same-day rush fee. So the script does not
rebuild the fee from scratch — it detects which formula the stored value already
matches and re-costs *that same formula* with the old day-rate. 9 bookings
matched no formula (manual prices / discounts) and were deliberately left alone.

> An earlier attempt on 2026-09-02 (14 rows, +₱2,100) was **rolled back by
> something unknown ~10 minutes later**, in both Supabase and Mongo. The cause
> was never identified. If corrections start silently reverting again, that is
> the precedent.

### 4.3 Dummy bookings and duplicates (user-performed, ~2026-09-05)

Test entries (`asfa`, `jejeje`, `wertfyhuhj`, `31asdasf`) and duplicate
submissions removed. Notably the "Pocket 3 overbooking" on 2026-06-21 turned out
to be **one renter submitting three times** (`Elaine Mirandq` / `Elaine Miranda`
/ `Elaine`), not a real double-booking.

Also fixed: a booking dated `0026-06-03` (year 26), and a 59-day rental
(`2026-01-07 → 2026-03-07`) that alone inflated a revenue estimate by ₱38,350.

### 4.4 Missing fees backfill (2026-09-12)

**53 real bookings had `rental_fee = NULL`** — wiped by a bulk run on
2026-09-01 — so Analytics counted them as ₱0. Backfilled at the rate in force on
each booking's own pick-up date: **+₱63,675**. `backfill-missing-fees.js`.

> These figures are **reconstructed, not recovered**. The originals are gone.
> Any booking that was discounted or custom-priced came back at list price.

Revenue went **₱211k → ₱283k** across all repairs.

### 4.5 Un-mirrored bookings (2026-09-14)

See §1. Three bookings restored; guard rails added.

---

## 5. Scripts: what each one is for

All live in `backend/scripts/`. Run from `backend/`.

| Script | Purpose | Safe to re-run? |
| --- | --- | --- |
| `hash-password.js` | Prints a `*_PASSWORD_HASH` for the admin login (asks for the password), or with `--secret` a random `AUTH_SECRET`. Writes nothing. | yes — read-only |
| `restore-unmirrored-bookings.js` | Replay failed Supabase mirrors. `--days=N` (default 30) or `--ref=<id>`. | yes — upserts on `response_id` |
| `backfill-missing-fees.js` | Fill `rental_fee` where NULL. `--with-addons` to include add-ons. | yes — only touches NULLs |
| `fix-historical-rate-card.js` | Re-cost bookings priced on the wrong rate card. | yes — only touches rows still on the new-card value |
| `migrate-delivery-cuts-to-expenses.js` | One-time: rider cuts → expense rows. | yes — aborts if `Rider cut` rows exist |
| `fill-rental-fees.js` | Older backfill; date-aware. Computes camera **+ add-ons**, which over-bills May–June. Prefer `backfill-missing-fees.js`. | only touches NULLs unless `--force` |
| `auto-complete-bookings.js` | Status housekeeping. | — |
| `migrate-to-supabase.js` | Original Mongo → Supabase migration. | ⚠ would resurrect deleted rows |
| `uppercase-cameras.js` | One-time normalisation. | — |

**No image tooling is available on this machine.** `convert` on Windows is the
*disk-conversion utility*, not ImageMagick — do not call it on an image.
Use PowerShell `System.Drawing` for resizing (see git history for the pattern).

---

## 6. Deployment constraints

- **Vercel Hobby: max 12 serverless functions.** Currently **12** (`backend/api/**/*.js`) —
  `api/lalamove.js` is the last slot.
  `public-availability` and `verify-renter` were folded into `api/public.js`
  (`?action=`), which also serves `track` and `return-details`.
  This is why `/api/bookings/by` multiplexes `type=camera|addon|unmirrored`
  rather than having separate routes. Adding a 13th file breaks the build.
- **Deployments can be "Blocked."** This is an account-level state, not a build
  failure — the build never runs. Cause seen here: the commit author's email was
  not recognised by the Vercel account, and Hobby does not allow collaborators on
  private repos. Fix is to add the commit email to the Vercel account, not to
  change code.
- **Bandwidth matters.** `GET /api/bookings` once returned **12.5 MB** per call
  (98% base64 ID photos) and is hit by 5 pages. It now returns ~0.26 MB by
  omitting document columns; rows carry `_partial: true` and anything needing
  documents fetches that one booking via `GET /api/bookings/:responseId`.
  See `frontend/src/utils/bookingDocuments.js`.
- The client site's inclusion posters in `public/` are ~9 MB each and
  **unreferenced** — the code uses the 500×500 `*-inclusions.png` variants.
  Do not point `assets.js` at the big ones.

---

## 7. Known open issues

| Issue | Detail |
| --- | --- |
| **~25 orphan rows in Mongo** | Deleted from Supabase but retained in Mongo. Harmless while nothing syncs Mongo→Supabase; a sync would resurrect them. Do not bulk-delete without re-checking ages (§1). |
| **Add-on naming is inconsistent** | The client site submits `"Extra Battery"`; the admin uses `"Extra G7X Battery"` / `"Extra X-T100 Battery"` / `"Extra R50 Battery"`. Both spellings exist in `booking_addons`. The 9 generic `"Extra Battery"` rows match no entry in `frontend/src/data/addons.js`, so they are invisible to add-on availability. |
| **Contracts are still static** | Damage fees / terms per camera live in `contracts.js` (client + admin). A camera added on the Catalog page gets the standard terms with no scratch fees until it is added there. |
| **`backend/lib/cameraDefaults.js` is dead** | Nothing imports it. Its header references `lib/cameraPricing.js` and a `camera_prices` table — **neither exists**. Leftover from an editable-pricing feature that was added then reverted. Its values are kept accurate anyway. Not a source of truth. |
| **`repeat_renter` / `repeat_ref` columns do not exist** | `toMongoFormat` reads them; `select("*")` tolerated it silently. The "Repeat renter" badge in `BookingModal` can therefore never display. |
| **Canon EOS R50 scratch fees are placeholders** | Copied from the G7X (₱3,000 / ₱5,000 / ₱10,000), marked `TODO — CONFIRM` in both `contracts.js` files. **These appear in the contract renters sign.** |
| **Genuine overbookings exist in history** | e.g. Canon G7X 6 out against 4 units on 2026-06-06. The `⚠ Overbooked by N` chip on `/cameras` and `/addons` surfaces these. |
| **Sign-in needs console setup** | The public site hides sign-in until `VITE_FIREBASE_*` are set (renter-side Vercel project) and the site's domain is in Firebase → Authentication → Authorized domains. Each option in `VITE_AUTH_PROVIDERS` (google, facebook, email) must be enabled under Sign-in method — a missing one shows "This sign-in option isn't turned on yet". Facebook also needs a Meta app. Google/Facebook popups were tested only against the Auth emulator (this dev environment can't load their scripts); email sign-up/sign-in was tested end to end there. Messenger/Facebook in-app browsers often block Google sign-in; the window says so and points to email. |
| **Analytics all-time vs month scope** | Overview is all-time by design; the Months tab is scoped. Labelled, but easy to misread. |

---

## 8. Conventions worth not breaking

- **`ui-*` classes** (`frontend/src/index.css`) are the design system: `ui-panel`,
  `ui-card`, `ui-btn`, `ui-input`, `ui-chip`, `ui-table`, `ui-modal`. The admin is
  **light-only** — the dark-mode toggle was removed, and no `dark:` variants
  remain. Do not reintroduce them.
- **`overflow-x` implies `overflow-y`.** Setting one axis to `auto` makes the
  browser compute the other to `auto`, which clips `ui-btn`'s hover lift (−2px)
  and grown shadow (7px 8px). Any scrolling container holding buttons needs
  padding for that. See the nav in `Header.jsx`.
- **Fee shape must be preserved when repairing data.** Never rebuild a historical
  fee from scratch; detect the formula it already matches and re-cost that.
- **Always dry-run first.** Every repair script in `backend/scripts/` follows the
  same pattern: dry-run default, `--commit` to apply, idempotency guard, backup
  to `database-backups/`.
- **Verify against live data, not assumptions.** Most bugs in §4 were found by
  replaying real rows through the real code paths, not by reading it.
