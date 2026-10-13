# S&R Rentals — admin panel + booking API

Camera rental business. Two repos:

- **this one** — admin panel (`frontend/`, React + Vite) and the API (`backend/`, Vercel serverless)
- **`../SnR-Rentals-App-Client-Side`** — public marketing + booking site

## Keep these docs current — this is a standing instruction

**Update the documentation in the same change as the work, never as a follow-up.**
Work here spans many sessions and the traps below are not discoverable from the
code alone. A doc that has drifted is worse than no doc: it actively misleads the
next person. (`SnR_Rentals_App_Status.md` documented the delivery-rider cut for
days after it was deleted.)

| When you… | Update |
| --- | --- |
| change behaviour, a data shape, or an invariant | the relevant section here + `docs/ENGINEERING-NOTES.md` |
| fix a production data issue | incident log — `ENGINEERING-NOTES.md` §4 (date, amount, script used) |
| add or change a script | script table — §5 |
| hit a new trap, or resolve a listed one | open issues §7 / conventions §8 |
| make a section of `SnR_Rentals_App_Status.md` untrue | mark it ⚠ stale there, don't leave it |

Verify doc claims against the code rather than asserting them.

## Firebase is the database now (Oct 2026)

`DATASOURCE=firebase` (the default) runs everything on **Firestore** — bookings,
uploaded documents, expenses, date notes and the **camera catalogue**. It
started empty; nothing was migrated.

**MongoDB and Supabase hold the real pre-Firebase data. Do not connect to,
write to, or "clean up" either of them.** Firebase mode never loads their
clients (`lib/dataSource.js` and the routes require them lazily, only in
legacy mode), and the frontends have no default API URL so a build can't fall
back to the old live deployment. Everything below about the Mongo/Supabase
split describes the legacy mode and the historical data.

- Firestore layout + queries: `backend/lib/firestoreQueries.js`
- Catalogue rules (validation, price/unit history, fees): `backend/lib/catalog.js`
- Catalogue API: `backend/api/catalog.js`; admin editor: `/catalog` (owner only)
- First-run defaults: `backend/lib/defaultCatalog.js` ("Load default cameras")

### Rental lifecycle and serial numbers (Oct 2026, from the defense panel)

- A rental moves **Pending → Reserved → (Out for delivery →) With renter →
  Returned → Completed**. `utils/lifecycle.jsx` `getStage()` derives that one
  stage from `status` + `FULFILLMENT_STATUS`; every badge, the Today
  dashboard (`/`) and the booking modal's `LifecyclePanel` use it. The
  calendar moved to `/schedule`.
- `FULFILLMENT_STATUS` is `null | out_for_delivery | out | returned`. The
  server (`applyLifecycle` in `firestoreQueries.js`) only allows real steps:
  release needs an approved booking **and a serial number** when the camera
  lists serials, a unit can't be released while another rental still has it,
  "returned" records `RETURN_CONDITION` (good/damaged) + `RETURN_NOTES`, and
  completing needs the unit returned.
- **`TIMELINE` is written only by the server** — every status change appends
  `{ at, event, note }`. Never PATCH it from the client.
- Cameras list physical units in `serials` (Catalog page). With serials,
  `units` = units in service. A serial with rental history can't be deleted,
  only retired, so "who rented this unit last" always resolves
  (`components/UnitHistory.jsx` on each camera page).

### Lalamove deliveries (Oct 2026)

- S&R delivers by **Lalamove** — through the **Lalamove v3 API** when the
  backend has `LALAMOVE_API_KEY` / `LALAMOVE_API_SECRET`, otherwise by hand.
  The shop's address and pin are in `backend/lib/shop.js` (and
  `frontend/src/data/shop.js` for the manual box) — change both together. The
  renter fills a Lalamove-style form when booking a delivery —
  `DELIVERY_DETAILS { recipientName, recipientPhone, address, landmark, notes, lat, lng }`
  with a map pin — and says where to collect it back (`RETURN_DETAILS`, same
  or a second form). Rules: `backend/lib/delivery.js`.
- Admin: the booking's `LalamoveBox` lays the details out in the Lalamove
  app's order (pick-up → drop-off → contact/note) with a Copy button per
  field — the shop's own location and number are in `frontend/src/data/shop.js` —
  and takes the order's tracking link
  (`LALAMOVE_DELIVERY_LINK` / `LALAMOVE_RETURN_LINK`). The Today dashboard
  tags deliveries that still need a rider booked.
- Renter: **`/track`** on the public site (reference code) shows the stage,
  timeline and Lalamove links, and lets them change the return pickup until
  the return rider is booked.
- **API flow** (`lib/lalamove.js` client, `lib/lalamoveBookings.js` flow,
  `api/lalamove.js` route, admin `LalamoveApiPanel`): Get price → Book. Booking
  a delivery *is* the release (serial required); if Lalamove refuses, the
  release is rolled back. Status is pulled (no webhook yet) when the booking
  or the renter's Track page is opened, or on Refresh: a completed delivery
  marks the unit with the renter; a completed return does **not** mark it
  returned — staff check condition. Order summaries live in
  `LALAMOVE_DELIVERY_ORDER` / `LALAMOVE_RETURN_ORDER`, server-written only.
- **Sandbox has no riders**, so a sandbox order sits at "Looking for a rider".
  For demos, "Simulate next step" (sandbox only — refused when
  `LALAMOVE_ENV=production`) steps it through rider found → picked up →
  dropped off, labelled "(simulated)" everywhere; a simulated order is never
  overwritten by Lalamove's real status. The renter's Track page maps the
  rider (🏠 shop, 📍 renter, 🛵 rider); a simulated rider sits near the
  pickup, then on the sender's pin, then on the recipient's pin. First real sandbox order: confirmed
  working on 2026-10-13 (quotation, order, share link).
- ⚠ The client was written from Lalamove's docs without network access to
  Lalamove and tested against a local mock of v3 (signature, quotation,
  order, driver, cancel). The first real check is a sandbox order from the
  deployed admin. `LALAMOVE_ENV=production` charges the Lalamove wallet.
- Public routes are multiplexed: `api/public.js?action=availability|verify-renter|track|return-details`
  (handlers in `lib/public/`).

## Read before writing data

**`docs/ENGINEERING-NOTES.md`** — traps, past incidents, and why things are the
way they are. The three things most likely to cause real damage:

1. **Bookings are written to MongoDB; the admin reads Supabase.** A failed
   mirror means a real booking exists, the renter has a confirmation, and the
   admin panel cannot see it. This has happened 3× (Sept 2026). Mongo is the
   *only* copy of an un-mirrored booking — **never bulk-delete Mongo rows that
   are missing from Supabase without checking their creation dates.**

2. **Every camera carries `priceHistory` and `unitHistory` on purpose.** Prices
   and stock change over time, and this data describes the past as well as the
   present. Flattening either silently restates historical revenue or invents
   overbookings. The catalogue now lives in Firestore and the server records
   history itself (`applyCameraUpdate` in `lib/catalog.js`): an edit on the
   Catalog page asks for the date it takes effect. Never write `pricing` or
   `units` to Firestore directly without going through that.

3. **Analytics never computes fees** — it sums the stored `RENTAL_FEE`. So a
   null fee counts as ₱0 silently and a wrong fee shows forever. Revenue bugs
   are fixed in the database, not in code.

## Commands

```bash
cd frontend && npm run dev        # admin panel, localhost:5173
cd frontend && npm run build      # must pass before committing
cd backend  && node scripts/<name>.js          # dry run
cd backend  && node scripts/<name>.js --commit  # apply
```

Every repair script in `backend/scripts/` is dry-run by default, idempotent, and
writes a backup to `database-backups/`. Keep that pattern for new ones.

## Constraints

- **Vercel Hobby: 12 serverless functions max.** Currently **12** (`backend/api/**/*.js`;
  `api/lalamove.js` took the last slot).
  A 13th breaks the build — multiplex on an existing route instead
  (see `api/bookings/by.js` and `api/public.js`).
- `GET /api/bookings` deliberately omits base64 document columns (it was 12.5 MB).
  Rows carry `_partial: true`; fetch one booking by id when documents are needed.
- **No image tooling.** `convert` on this Windows machine is the *disk* utility,
  not ImageMagick. Use PowerShell `System.Drawing`.

## Conventions

- Admin is **light-only**. `ui-*` classes in `frontend/src/index.css` are the
  design system (`ui-panel`, `ui-btn`, `ui-input`, `ui-chip`, …). No `dark:` variants.
- Camera data (names, units, rates, add-ons, inclusions) is the Firestore
  `cameras` collection, read via `GET /api/catalog` by the admin
  (`hooks/useCameras.js`) and the public site (`src/data/catalog.js`). The
  static lists still in `transformBooking.js`, `fill-rental-fees.js` and
  `public-availability.js` are legacy-mode only. Add-on **stock** counts are
  still `frontend/src/data/addons.js`.
- Verify against live data by replaying real rows through the real code paths.
  Most bugs here were found that way, not by reading code.

## Related docs

- `SnR_Rentals_App_Status.md` — what the app is, routes, schema, env vars.
  ⚠ Its "Delivery rider cut" section is **stale**; that logic was removed.
- `docs/ENGINEERING-NOTES.md` — incidents, repairs, open issues.
