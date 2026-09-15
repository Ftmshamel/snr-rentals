# SnR Rentals — project progress

> **New here?** Read `CLAUDE.md` first, then `docs/ENGINEERING-NOTES.md` before
> writing any data. This document describes *what the app is*; those describe
> *what will bite you* — notably the MongoDB/Supabase write-read split that has
> silently lost three real bookings.
>
> Last reviewed 2026-09-14. Sections marked ⚠ are known-stale.

**Last updated:** 2026-09-02

This file tracks what exists in the repo today and what is still open. Update it when milestones ship or scope changes.

---

## Vision (short)

Bridge **Google Form** rental inquiries into a database via a **Vercel** serverless API, surfaced through the **SnR Rentals — Admin Panel** (React, separate Vercel project).

The backend now **dual-writes**: every form submission is upserted into **MongoDB** (the original store) and mirrored into **Supabase (PostgreSQL)**. A single `DATASOURCE` env var decides which store the admin panel **reads/writes** through. Production currently runs on **Supabase**.

---

## Architecture at a glance

```
Google Form ──(Apps Script POST)──► /api/submit ──┬──► MongoDB  (upsert by responseId)
                                                   └──► Supabase (mirror: bookings + booking_addons)

Admin Panel (React/Vite) ──(Bearer token)──► /api/* ──► dataSource.js ──► Supabase  (DATASOURCE=supabase, live)
                                                                       └─► MongoDB   (DATASOURCE=mongodb)
```

- **Data-source switch:** `backend/lib/dataSource.js` exports either `supabaseQueries` (when `DATASOURCE=supabase`) or `bookingQueries` (MongoDB, the default). All read/update/delete routes go through this indirection.
- **Field shape:** Supabase rows are snake_case; `supabaseQueries.toMongoFormat()` converts them back to the SCREAMING_SNAKE_CASE shape the frontend expects, and `FIELD_MAP` maps frontend field names → Supabase columns for PATCH updates.
- **Auth:** `/api/auth/login` checks username/password against env-configured **admin** and **owner** users and returns a shared `ADMIN_TOKEN` plus a `role`. The frontend stores `auth_token` + `auth_role` in `localStorage`; `lib/auth.js` `requireAuth` validates the Bearer token on protected routes.

---

## Current snapshot

| Area                                   | Status                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| Backend package (`snr-rentals-bridge-api`) | **In repo** — Node 18+, `mongodb` + `@supabase/supabase-js`                         |
| MongoDB helper (`lib/mongo.js`)        | **Done** — pooled client via `global` for warm Vercel invocations                       |
| Supabase helper (`lib/supabase.js`)    | **Done** — service-role client                                                          |
| Data-source switch (`lib/dataSource.js`) | **Done** — `DATASOURCE` toggles Supabase vs MongoDB                                   |
| Submit API (`api/submit.js`)           | **Done** — upsert MongoDB + best-effort Supabase mirror; auto-calcs fee on mirror       |
| Auth API (`api/auth/login.js`)         | **Done** — admin/owner login, role-aware                                                |
| Bookings read/write API (`api/bookings/*`) | **Done** — list, day, pending, by camera, by add-on, single GET/PATCH/DELETE        |
| Expenses API (`api/expenses.js`)       | **Done** — GET/POST/PATCH/DELETE (Supabase)                                             |
| Date-notes API (`api/date-notes.js`)   | **Done** — per-date sticky notes, GET/POST/DELETE (Supabase, upsert by date)            |
| Supabase schema (`scripts/supabase-schema.sql`) | **Done** — `bookings`, `booking_addons`, `expenses`, `date_notes`              |
| **API Vercel deployment**              | **Live** — env holds Mongo + Supabase secrets, `DATASOURCE=supabase` (not committed)    |
| **Admin frontend** (`frontend/`)       | **Live** — Vite + React 18 + Tailwind + Router 6                                        |
| Google Forms → Apps Script → API       | **Done** — submissions land in both stores                                              |
| Role-based access (admin / owner)      | **Done** — owner-only: Rentals, Analytics, Expenses                                     |
| Root README                            | **Not present** (this status doc is the closest thing)                                  |
| Tests / CI                             | **Not present**                                                                         |

---

## Backend API routes

| Method(s)              | Route                              | Purpose                                                        |
| ---------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `POST`                 | `/api/submit`                      | Google Form ingest — upsert Mongo + mirror Supabase            |
| `POST`                 | `/api/auth/login`                  | Login; returns token + role (`admin`/`owner`)                  |
| `GET`                  | `/api/bookings`                    | All bookings, sorted                                           |
| `GET`                  | `/api/bookings/day?date=YYYY-MM-DD`| Bookings whose range includes the date                         |
| `GET`                  | `/api/bookings/pending`            | Pending approvals (drives the APPROVALS badge)                 |
| `GET`                  | `/api/bookings/by?type=camera&name=...` | Bookings for one camera                                    |
| `GET`                  | `/api/bookings/by?type=addon&name=...` | Bookings that include an add-on                              |
| `GET/PATCH/DELETE`     | `/api/bookings/[responseId]`       | Read / edit / delete a single booking                          |
| `GET/POST/PATCH/DELETE`| `/api/expenses`                    | Expense CRUD (`?id=` for PATCH/DELETE)                         |
| `GET/POST/DELETE`      | `/api/date-notes?date=YYYY-MM-DD`  | Per-date note (POST upserts, DELETE clears)                    |

> **Vercel Hobby limit:** max **12** serverless functions per deployment. Current count is **11**, leaving 1 of headroom. Removed along the way: `api/backfill-fees.js` (one-time), `api/bookings/week.js` (unused), `api/cameras/index.js` (frontend reads `data/cameras.js` locally).

---

## Frontend (routed pages)

| Route                  | Page                     | Access | Notes                                                                 |
| ---------------------- | ------------------------ | ------ | --------------------------------------------------------------------- |
| `/`                    | `MonthlySchedule`        | all    | Month calendar, day detail, new-rental modal, availability, overdue list, **per-date notes** |
| `/cameras`             | `CameraList`             | all    | Camera inventory                                                      |
| `/cameras/:cameraName` | `CameraCalendar`         | all    | Per-camera calendar with per-unit distribution                        |
| `/camera`, `/camera/:cameraName` | Redirect/alias    | all    | Backward-compatible singular aliases for the camera pages              |
| `/quotation`           | `QuotationGenerator`     | all    | **Two tabs:** Reservation quote + Remaining-Balance quote             |
| `/approvals`           | `Approvals`              | all    | Pending submissions; badge count in header                            |
| `/rentals`             | `RentalsTable`           | owner  | Full rentals table                                                    |
| `/analytics`           | `Analytics`              | owner  | Revenue, rider delivery cut, earnings, expenses, net, by camera/month |
| `/expenses`            | `Expenses`               | owner  | Expense CRUD                                                          |

- **Quotation → Remaining Balance tab:** search a renter to auto-fill rental fee / downpayment, defaults **Security Deposit to ₱1,000**, and shows the renter's **Proof of Downpayment** image (lightbox). Output is the package-summary format (rental fee + delivery + deposit − 20% downpayment = remaining balance).
- **Owner-only nav** (RENTALS / ANALYTICS / EXPENSES) is gated in both `Header.jsx` (link visibility) and `App.jsx` (route redirects to `/` for non-owners).
- **Unrouted legacy files still on disk:** `pages/RentalsReport.jsx`, `pages/AddOnList.jsx`, `pages/AddOnCalendar.jsx` (and the `useAddOns` hook / `data/addons.js` / `AddOnRow` / `AddOnSection`). Safe to delete when convenient.

---

## Supabase schema (`backend/scripts/supabase-schema.sql`)

- **`bookings`** — renter/trip/financial fields. Notable columns: `rental_fee`, `half_day_late`, `half_day_early`, `notes`, `downpayment_paid`, `fulfillment_status` (`null` / `out` / `returned`), `status`, `source`, document Drive IDs, `updated_at` (auto-bumped by trigger).
- **`booking_addons`** — one row per add-on, FK to `bookings` (cascade delete).
- **`expenses`** — `amount`, `description`, `date`.
- **`date_notes`** — `date` (unique), `note`, `updated_at`. Backs the per-date notes on the schedule.

---

## Helper scripts (`backend/scripts/`)

| Script                      | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `supabase-schema.sql`       | DDL for all tables — run in Supabase SQL Editor                               |
| `migrate-to-supabase.js`    | One-time MongoDB → Supabase migration                                         |
| `fill-rental-fees.js`       | Backfill `rental_fee` for rows missing it, from camera pricing               |
| `auto-complete-bookings.js` | Mark past bookings `status = "completed"`                                     |
| `uppercase-cameras.js`      | Normalize camera names to UPPERCASE in the DB                                 |

> ⚠ **Camera pricing is duplicated** in three places that must stay in sync: `frontend/src/data/cameras.js`, `backend/lib/transformBooking.js`, and `backend/scripts/fill-rental-fees.js`.

---

## Business rules (domain logic)

These are non-obvious rules baked into the code. Keep this section and the code in sync.

### Delivery rider cut (friend who delivers) — **REMOVED 2026-09-03**

> ⚠ **This section is historical.** `calcDeliveryCut` no longer exists. S&R
> stopped working with delivery riders, so the derived deduction was removed
> from Analytics. The ₱13,600 actually paid out (May–June 2026) was migrated
> into the **expenses** table as one row per delivery, prefixed `Rider cut — `,
> so it still reduces net income via the normal expense path. Verified
> value-neutral: net income identical before and after, every month. See
> `backend/scripts/migrate-delivery-cuts-to-expenses.js` and
> `docs/ENGINEERING-NOTES.md` §3.
>
> The table below records what the rule *was*, for anyone auditing figures from
> that period.

Previously tracked in `frontend/src/pages/Analytics.jsx` → `calcDeliveryCut`. Applied **only to delivery-mode bookings**, keyed on the **pick-up date**:

| Pick-up date era            | Rider cut                                       |
| --------------------------- | ----------------------------------------------- |
| Before **May 12, 2026**     | ₱0 — arrangement did not exist yet              |
| **May 12 – May 31, 2026**   | Flat: **₱100** (1–3 days) / **₱200** (>3 days)  |
| **June 2026**               | Per day: **₱100 × number of days**              |
| **July 1, 2026 onward**     | ₱0 — rule not decided yet (revisit)             |

- Days = `round((return − pickup) / 1 day)`, floored at 1.
- Analytics surfaces **Total Revenue**, **Delivery Cut** (rider's share), and **My Earnings** (revenue − cut).
- ⚠ July+ currently returns ₱0 **by design**. Update the `JULY_START` branch when the next rule is decided.

### Legacy / outdated entries (fixed fee)

Bookings carry a `source` (frontend: `_source`). App-created records use `google_form` or `manual`. Anything else (legacy CSV/Mongo imports such as `outdated_csv` or `unknown`) is treated as a **fixed historical record**:

- Their **rental fee is never auto-recalculated**. In the edit modal (`frontend/src/components/BookingModal.jsx`, helper `isLegacyEntry`), legacy entries force manual-fee mode, hide the auto-calc box, and show an amber "Legacy entry — fee is fixed" banner.
- On save, the stored/entered fee is preserved; the camera-pricing auto-calc is bypassed.
- New (`google_form` / `manual`) bookings keep normal auto-calc behavior: camera pricing × **effective days** + add-ons, where effective days include the half-day adjustments (`+0.5` late return, `−0.5` early return).

### Fee auto-calculation

- New form submissions get a fee computed on the **Supabase mirror** via `transformBooking.autoCalcFee` (camera tier rate × days + add-ons). The MongoDB copy stores the raw form payload.
- In the admin edit modal, the fee recomputes live from camera + dates + add-ons + half-day toggles, unless "Override rental fee manually" is ticked (or the entry is legacy).

---

## Environment variables

**Backend** (`backend/.env`):

| Var                                                   | Purpose                                           |
| ----------------------------------------------------- | ------------------------------------------------- |
| `MONGODB_URI`                                         | Mongo connection string                           |
| `MONGODB_DB` / `MONGODB_COLLECTION`                   | Optional (default `snr_rentals` / `form_submissions`) |
| `SUPABASE_URL`                                        | Project URL — **no** `/rest/v1` suffix            |
| `SUPABASE_SERVICE_KEY`                                | Service-role key                                  |
| `DATASOURCE`                                          | `supabase` (live) or `mongodb`                    |
| `ADMIN_TOKEN`                                         | Shared bearer token returned on login             |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD`                   | Admin login                                       |
| `OWNER_USERNAME` / `OWNER_PASSWORD`                   | Owner login (unlocks Rentals/Analytics/Expenses)  |

**Frontend** (`frontend/.env`):

| Var                    | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `VITE_API_BASE_URL`    | API origin (no trailing slash); required for prod builds       |
| `VITE_USE_REMOTE_API`  | `true` to make local dev hit the deployed API instead of proxy |

---

## In progress / open items

1. **DB migrations to apply in Supabase** (if not already run on the live project):
   ```sql
   ALTER TABLE bookings DROP COLUMN IF EXISTS half_day;
   ALTER TABLE bookings ADD COLUMN IF NOT EXISTS half_day_late  BOOLEAN DEFAULT false;
   ALTER TABLE bookings ADD COLUMN IF NOT EXISTS half_day_early BOOLEAN DEFAULT false;
   ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;
   ALTER TABLE bookings ADD COLUMN IF NOT EXISTS downpayment_paid   NUMERIC(10,2);
   ALTER TABLE bookings ADD COLUMN IF NOT EXISTS fulfillment_status TEXT;
   CREATE TABLE IF NOT EXISTS date_notes (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     date DATE UNIQUE NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   CREATE INDEX IF NOT EXISTS idx_date_notes_date ON date_notes (date);
   ```
2. **Decide the July-2026-onward rider cut rule** and update `calcDeliveryCut`.
3. **Cleanup** — delete unrouted legacy files (`RentalsReport`, `AddOnList`, `AddOnCalendar`, add-on hook/data) once confirmed unneeded; keep `node_modules` out of git.
4. **Hardening / docs** — root README, optional rate limiting, structured logs/alerting.
5. **Pricing single-source** — collapse the triplicated camera pricing into one shared module.

---

## Repo layout (current)

```
S-R-Rentals-App/
├── SnR_Rentals_App_Status.md   ← this file
├── frontend/
│   ├── index.html · package.json · vite.config.js · tailwind.config.js · postcss.config.js · vercel.json
│   └── src/
│       ├── App.jsx · main.jsx · index.css
│       ├── components/  (Header, MonthCalendar, BookingDetail, BookingModal,
│       │                 NewRentalModal, DateNoteEditor, CameraRow, DayRow, EventCard, ModeBadge, …)
│       ├── pages/       (Login, MonthlySchedule, CameraList, CameraCalendar, QuotationGenerator,
│       │                 Approvals, RentalsTable, Analytics, Expenses, + unrouted legacy files)
│       ├── hooks/       (useBookings, useCameras, useAddOns)
│       ├── utils/       (api.js, dateHelpers.js)
│       └── data/        (cameras.js, addons.js)
└── backend/
    ├── package.json · .env.example · .gitignore
    ├── api/
    │   ├── submit.js
    │   ├── auth/login.js
    │   ├── expenses.js
    │   ├── date-notes.js
    │   └── bookings/
    │       ├── index.js · day.js · pending.js · [responseId].js
    │       ├── camera/[cameraName].js
    │       └── addon/[addonName].js
    ├── lib/
    │   ├── mongo.js · supabase.js · dataSource.js
    │   ├── bookingQueries.js (Mongo) · supabaseQueries.js (Supabase)
    │   ├── transformBooking.js · bookingsCollection.js · camerasCollection.js
    │   ├── cors.js · auth.js
    └── scripts/
        ├── supabase-schema.sql · migrate-to-supabase.js
        ├── fill-rental-fees.js · auto-complete-bookings.js · uppercase-cameras.js
```

---

## How to refresh this document

After each meaningful change, bump **Last updated**, adjust the **Current snapshot** table, keep **Backend API routes** / **Frontend pages** / **Business rules** accurate, and move items in/out of **In progress / open items** so this stays the single source of truth for status.
