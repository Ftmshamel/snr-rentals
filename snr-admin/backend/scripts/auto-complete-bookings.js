require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  (process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
  (process.env.SUPABASE_SERVICE_KEY || "").trim()
);

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "completed" })
    .lt("return_date", today)
    .not("status", "eq", "completed")
    .not("status", "eq", "cancelled")
    .select("full_name, preferred_camera, return_date, status");

  if (error) {
    console.error("Failed:", error.message);
    process.exit(1);
  }

  if (data.length === 0) {
    console.log("No bookings to update.");
    return;
  }

  for (const row of data) {
    console.log(`  COMPLETED  ${row.full_name} | ${row.preferred_camera} | returned ${row.return_date}`);
  }

  console.log(`\n  Total updated: ${data.length}`);
}

// Guard: this file only runs when invoked directly (node scripts/…).
// Without it, anything that require()s this module — a linter, a test
// harness, an editor's analysis — would execute it against the live
// database.
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
