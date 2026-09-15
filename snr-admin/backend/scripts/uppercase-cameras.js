require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  (process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
  (process.env.SUPABASE_SERVICE_KEY || "").trim()
);

async function main() {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, preferred_camera");

  if (error) {
    console.error("Failed to fetch bookings:", error.message);
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;

  for (const row of data) {
    const upper = (row.preferred_camera || "").toUpperCase();
    if (upper === row.preferred_camera) {
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ preferred_camera: upper })
      .eq("id", row.id);

    if (updateError) {
      console.error(`  ERROR ${row.id}:`, updateError.message);
    } else {
      console.log(`  ${row.preferred_camera} → ${upper}`);
      updated++;
    }
  }

  console.log("\n── Done ──────────────────────────────────");
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped} (already uppercase)`);
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
