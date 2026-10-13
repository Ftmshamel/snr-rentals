// Which store the API reads and writes. DATASOURCE in the environment:
//
//   firebase   Firestore only (default). Never connects to MongoDB or Supabase.
//   supabase   legacy: bookings written to MongoDB + mirrored to Supabase
//   mongodb    legacy: MongoDB only
//
// The legacy values exist so the old databases can still be read if ever
// needed; they hold real historical data and nothing in firebase mode touches
// them.
const SOURCE = (process.env.DATASOURCE || "firebase").trim().toLowerCase();

module.exports = { SOURCE, isFirebase: () => SOURCE === "firebase" };
