# Engineering notes — traps, incidents, and why things are the way they are

Written 2026-09-14. Companion to `SnR_Rentals_App_Status.md` (which describes
*what the app is*); this file describes *what will bite you*.

If you are an agent or developer picking this codebase up, read
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

- **Vercel Hobby: max 12 serverless functions.** Currently **11** (`backend/api/**/*.js`).
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
| **`backend/lib/cameraDefaults.js` is dead** | Nothing imports it. Its header references `lib/cameraPricing.js` and a `camera_prices` table — **neither exists**. Leftover from an editable-pricing feature that was added then reverted. Its values are kept accurate anyway. Not a source of truth. |
| **`repeat_renter` / `repeat_ref` columns do not exist** | `toMongoFormat` reads them; `select("*")` tolerated it silently. The "Repeat renter" badge in `BookingModal` can therefore never display. |
| **Canon EOS R50 scratch fees are placeholders** | Copied from the G7X (₱3,000 / ₱5,000 / ₱10,000), marked `TODO — CONFIRM` in both `contracts.js` files. **These appear in the contract renters sign.** |
| **Genuine overbookings exist in history** | e.g. Canon G7X 6 out against 4 units on 2026-06-06. The `⚠ Overbooked by N` chip on `/cameras` and `/addons` surfaces these. |
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
