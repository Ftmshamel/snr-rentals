const { setCorsJson } = require("../lib/cors");
const { requireAuth } = require("../lib/auth");
const { isFirebase } = require("../lib/sourceName");

async function handleFirestore(req, res) {
  const store = require("../lib/firestoreQueries");
  const date = req.query?.date;
  // The date is the Firestore document id, so it must be exactly YYYY-MM-DD.
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(String(date)))
    return res.status(400).json({ ok: false, error: "date must be YYYY-MM-DD" });

  if (req.method === "GET") {
    if (!date) return res.status(400).json({ ok: false, error: "date is required" });
    const data = await store.getDateNote(date);
    return res.status(200).json({ ok: true, note: data?.note || "" });
  }
  if (req.method === "POST") {
    const raw = req.body;
    const body =
      raw && typeof raw === "object" && !Buffer.isBuffer(raw) ? raw : JSON.parse(raw || "{}");
    const { date: d, note } = body;
    if (!d || note == null)
      return res.status(400).json({ ok: false, error: "date and note are required" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d)))
      return res.status(400).json({ ok: false, error: "date must be YYYY-MM-DD" });
    return res.status(200).json({ ok: true, note: await store.upsertDateNote(d, note) });
  }
  if (req.method === "DELETE") {
    if (!date) return res.status(400).json({ ok: false, error: "date is required" });
    await store.deleteDateNote(date);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (!requireAuth(req, res)) return;

  try {
    if (isFirebase()) return await handleFirestore(req, res);

    // Legacy: DATASOURCE=supabase / mongodb.
    const { getSupabaseClient } = require("../lib/supabase");
    const sb = getSupabaseClient();
    const date = req.query?.date;

    // GET — fetch note for a specific date
    if (req.method === "GET") {
      if (!date) return res.status(400).json({ ok: false, error: "date is required" });
      const { data, error } = await sb
        .from("date_notes")
        .select("note, updated_at")
        .eq("date", date)
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, note: data?.note || "" });
    }

    // POST — upsert note for a date
    if (req.method === "POST") {
      const raw = req.body;
      const body =
        raw && typeof raw === "object" && !Buffer.isBuffer(raw)
          ? raw
          : JSON.parse(raw || "{}");
      const { date: d, note } = body;
      if (!d || note == null)
        return res.status(400).json({ ok: false, error: "date and note are required" });
      const { data, error } = await sb
        .from("date_notes")
        .upsert(
          { date: d, note: String(note).trim(), updated_at: new Date().toISOString() },
          { onConflict: "date" },
        )
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, note: data });
    }

    // DELETE — remove note for a date
    if (req.method === "DELETE") {
      if (!date) return res.status(400).json({ ok: false, error: "date is required" });
      const { error } = await sb.from("date_notes").delete().eq("date", date);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("[api/date-notes]", err);
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
};
