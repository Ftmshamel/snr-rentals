/**
 * One-time migration: delivery rider cuts → expenses.
 *
 * Analytics used to special-case the rider's share, deriving it from each
 * booking's pick-up date and subtracting it from revenue (calcDeliveryCut in
 * frontend/src/pages/Analytics.jsx). S&R no longer works with delivery riders,
 * so that derived deduction is being removed from the code.
 *
 * Deleting it outright would silently inflate May–June 2026 net income by the
 * full ₱13,600 that was actually paid out. This script moves that money into
 * the expenses table instead, one row per delivery, so the historical figures
 * stay correct once the derived logic is gone.
 *
 * The eras below are copied verbatim from the calcDeliveryCut this replaces:
 *   before 2026-05-12          → ₱0    (no arrangement yet)
 *   2026-05-12 … 2026-05-31    → flat  ₱100 (1–3 days) / ₱200 (>3 days)
 *   2026-06-01 … 2026-06-30    → ₱100 × days
 *   2026-07-01 onward          → ₱0    (no rule was ever set)
 *
 * Usage:
 *   node scripts/migrate-delivery-cuts-to-expenses.js            # dry run
 *   node scripts/migrate-delivery-cuts-to-expenses.js --commit   # writes
 *
 * Safe to re-run: it refuses to insert if rows carrying MARKER already exist.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  (process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
  (process.env.SUPABASE_SERVICE_KEY || "").trim(),
);

// Every row this script creates carries this prefix, which is what makes the
// migration detectable (and reversible) later.
const MARKER = "Rider cut";

const CUT_START = "2026-05-12";
const JUNE_START = "2026-06-01";
const JULY_START = "2026-07-01";

const EXCLUDED_STATUSES = ["pending", "rejected", "cancelled"];

function calcDeliveryCut(booking) {
  const mode = (booking.preferred_mode || "").trim().toLowerCase();
  if (!mode.startsWith("deliver")) return 0;
  const pickUp = booking.pick_up_date;
  if (!pickUp) return 0;
  if (pickUp < CUT_START) return 0;
  if (pickUp >= JULY_START) return 0;
  const start = new Date(pickUp + "T00:00:00");
  const end = new Date((booking.return_date || pickUp) + "T00:00:00");
  const days = Math.max(1, Math.round((end - start) / 86400000));
  if (pickUp >= JUNE_START) return 100 * days;
  return days <= 3 ? 100 : 200;
}

const peso = (n) => "PHP " + Number(n).toLocaleString();

async function main() {
  const commit = process.argv.includes("--commit");

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      "response_id, full_name, facebook_account_name, preferred_camera, preferred_mode, pick_up_date, return_date, rental_fee, status",
    );
  if (error) {
    console.error("Failed to fetch bookings:", error.message);
    process.exit(1);
  }

  // Mirrors the `eligible` filter Analytics applies before summing.
  const eligible = bookings.filter((b) => {
    const s = (b.status || "").toLowerCase();
    return !EXCLUDED_STATUSES.includes(s) && b.rental_fee != null;
  });

  const rows = eligible
    .map((b) => ({ booking: b, amount: calcDeliveryCut(b) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => a.booking.pick_up_date.localeCompare(b.booking.pick_up_date))
    .map(({ booking, amount }) => {
      const renter =
        booking.facebook_account_name || booking.full_name || "unknown renter";
      const camera = booking.preferred_camera || "unknown unit";
      return {
        amount,
        date: booking.pick_up_date,
        description: `${MARKER} — ${camera}, ${renter}`,
      };
    });

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byMonth = {};
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + r.amount;
  }

  console.log("── Delivery cuts to migrate ─────────────────────────");
  console.log("  eligible bookings :", eligible.length);
  console.log("  with a rider cut  :", rows.length);
  console.log("  total             :", peso(total));
  for (const [m, v] of Object.entries(byMonth).sort()) {
    console.log("     ", m, "→", peso(v));
  }
  console.log();

  // Guard: never insert twice.
  const { data: existing, error: exErr } = await supabase
    .from("expenses")
    .select("id, date, amount, description")
    .ilike("description", `${MARKER}%`);
  if (exErr) {
    console.error("Failed to read expenses:", exErr.message);
    process.exit(1);
  }
  if (existing && existing.length > 0) {
    console.error(
      `ABORT: ${existing.length} expense row(s) already start with "${MARKER}".`,
    );
    console.error("This migration has already run. Nothing was written.");
    process.exit(1);
  }

  if (!commit) {
    console.log("DRY RUN — nothing written. Re-run with --commit to apply.");
    console.log();
    console.log("First 8 rows that would be inserted:");
    rows.slice(0, 8).forEach((r) =>
      console.log(
        "   ",
        r.date,
        String(peso(r.amount)).padStart(9),
        "|",
        r.description,
      ),
    );
    if (rows.length > 8) console.log("    … and", rows.length - 8, "more");
    return;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("expenses")
    .insert(rows)
    .select("id");
  if (insErr) {
    console.error("Insert failed:", insErr.message);
    process.exit(1);
  }
  console.log("Inserted", inserted.length, "expense rows totalling", peso(total));
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
