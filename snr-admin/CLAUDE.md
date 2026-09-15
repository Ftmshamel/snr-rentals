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

## Read before writing data

**`docs/ENGINEERING-NOTES.md`** — traps, past incidents, and why things are the
way they are. The three things most likely to cause real damage:

1. **Bookings are written to MongoDB; the admin reads Supabase.** A failed
   mirror means a real booking exists, the renter has a confirmation, and the
   admin panel cannot see it. This has happened 3× (Sept 2026). Mongo is the
   *only* copy of an un-mirrored booking — **never bulk-delete Mongo rows that
   are missing from Supabase without checking their creation dates.**

2. **`cameras.js` carries `priceHistory` and `unitHistory` on purpose.** Prices
   and stock change over time, and this data describes the past as well as the
   present. Flattening either silently restates historical revenue or invents
   overbookings. To record a change, move the old value into the history array
   with its effective date — don't overwrite.

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

- **Vercel Hobby: 12 serverless functions max.** Currently 11 (`backend/api/**/*.js`).
  A 13th breaks the build — multiplex on an existing route instead
  (see `api/bookings/by.js`, which handles `type=camera|addon|unmirrored`).
- `GET /api/bookings` deliberately omits base64 document columns (it was 12.5 MB).
  Rows carry `_partial: true`; fetch one booking by id when documents are needed.
- **No image tooling.** `convert` on this Windows machine is the *disk* utility,
  not ImageMagick. Use PowerShell `System.Drawing`.

## Conventions

- Admin is **light-only**. `ui-*` classes in `frontend/src/index.css` are the
  design system (`ui-panel`, `ui-btn`, `ui-input`, `ui-chip`, …). No `dark:` variants.
- Camera/add-on data lives in `frontend/src/data/`, mirrored into
  `backend/lib/transformBooking.js`, `backend/scripts/fill-rental-fees.js`, and
  `backend/api/public-availability.js`. Update them together — see
  `ENGINEERING-NOTES.md` §2 for the full list.
- Verify against live data by replaying real rows through the real code paths.
  Most bugs here were found that way, not by reading code.

## Related docs

- `SnR_Rentals_App_Status.md` — what the app is, routes, schema, env vars.
  ⚠ Its "Delivery rider cut" section is **stale**; that logic was removed.
- `docs/ENGINEERING-NOTES.md` — incidents, repairs, open issues.
