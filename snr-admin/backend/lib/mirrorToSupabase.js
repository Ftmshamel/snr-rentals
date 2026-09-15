const { getSupabaseClient } = require("./supabase");
const { transformBooking } = require("./transformBooking");

/**
 * Mirrors a booking from MongoDB into Supabase.
 *
 * Context: /api/submit writes MongoDB first and Supabase second. The admin
 * panel reads Supabase (DATASOURCE=supabase), so a booking whose mirror fails
 * is invisible there — no Approvals entry, no schedule slot, no revenue —
 * while the renter still gets a success confirmation.
 *
 * That happened three times between 2026-09-01 and 2026-09-13 (Ribo GJ,
 * Mary Joy Salonn, Mitch Buhat). The writes themselves were valid — replaying
 * them later succeeded unchanged — so the failures were transient. The old
 * code caught the error, console.error'd it, and moved on, which turned a
 * momentary blip into permanent invisible data loss.
 *
 * This retries with backoff, and treats an add-on write failure as a mirror
 * failure too (previously those errors were not checked at all, so a booking
 * could land without its add-ons and still report success).
 */

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 300;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `client` is injectable purely so this can be tested against simulated
// failures without writing to the real database.
async function mirrorOnce(payload, client) {
  const supabase = client || getSupabaseClient();
  const { booking, addons } = await transformBooking(payload);

  const { data, error } = await supabase
    .from("bookings")
    .upsert(booking, { onConflict: "response_id" })
    .select("id")
    .single();
  if (error) throw new Error(`bookings upsert failed: ${error.message}`);
  if (!data?.id) throw new Error("bookings upsert returned no id");

  if (addons.length > 0) {
    const { error: delError } = await supabase
      .from("booking_addons")
      .delete()
      .eq("booking_id", data.id);
    if (delError) throw new Error(`add-on clear failed: ${delError.message}`);

    const { error: insError } = await supabase
      .from("booking_addons")
      .insert(addons.map((addon_name) => ({ booking_id: data.id, addon_name })));
    if (insError) throw new Error(`add-on insert failed: ${insError.message}`);
  }

  return data.id;
}

/**
 * @returns {Promise<{ok: true, supabaseId: string, attempts: number}
 *                 | {ok: false, error: string, attempts: number}>}
 * Never throws — the caller decides what a failure means.
 */
async function mirrorBookingToSupabase(
  payload,
  { attempts = MAX_ATTEMPTS, client = null } = {},
) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const supabaseId = await mirrorOnce(payload, client);
      return { ok: true, supabaseId, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        // 300ms, 600ms — short enough to stay inside the request, long enough
        // to ride out a blip or a brief connection-limit spike.
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  return { ok: false, error: lastError?.message || "unknown error", attempts };
}

module.exports = { mirrorBookingToSupabase };
