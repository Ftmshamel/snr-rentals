// ── DATA SOURCE SWITCH ────────────────────────────────────────────────────────
//
//  Set DATASOURCE in backend/.env (or the Vercel project):
//
//    DATASOURCE=firebase    ← Firestore (default) — see lib/firestoreQueries.js
//    DATASOURCE=supabase    ← legacy: read/write Supabase
//    DATASOURCE=mongodb     ← legacy: read/write MongoDB
//
//  The modules are required lazily so firebase mode never even loads the
//  MongoDB or Supabase clients.
// ─────────────────────────────────────────────────────────────────────────────

const { SOURCE } = require("./sourceName");

module.exports =
  SOURCE === "supabase"
    ? require("./supabaseQueries")
    : SOURCE === "mongodb"
      ? require("./bookingQueries")
      : require("./firestoreQueries");
