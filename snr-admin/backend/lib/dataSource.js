// ── DATA SOURCE SWITCH ────────────────────────────────────────────────────────
//
//  To switch between Supabase and MongoDB, change DATASOURCE in backend/.env:
//
//    DATASOURCE=supabase    ← read/write from Supabase (current)
//    DATASOURCE=mongodb     ← read/write from MongoDB  (original)
//
// ─────────────────────────────────────────────────────────────────────────────

const source = (process.env.DATASOURCE || "mongodb").trim().toLowerCase();

module.exports = source === "supabase"
  ? require("./supabaseQueries")
  : require("./bookingQueries");
