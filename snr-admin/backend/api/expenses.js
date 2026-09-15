const { setCorsJson } = require("../lib/cors");
const { requireAuth } = require("../lib/auth");
const { getSupabaseClient } = require("../lib/supabase");

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (!requireAuth(req, res)) return;

  try {
    const sb = getSupabaseClient();
    const id = req.query?.id;

    // GET — list all
    if (req.method === "GET" && !id) {
      const { data, error } = await sb
        .from("expenses")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, expenses: data || [] });
    }

    // POST — create
    if (req.method === "POST") {
      const raw = req.body;
      const body =
        raw && typeof raw === "object" && !Buffer.isBuffer(raw)
          ? raw
          : JSON.parse(raw || "{}");
      const { amount, description, date } = body;
      if (!amount || !description || !date)
        return res.status(400).json({ ok: false, error: "amount, description, and date are required" });
      const { data, error } = await sb
        .from("expenses")
        .insert({ amount: Number(amount), description: String(description).trim(), date })
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(201).json({ ok: true, expense: data });
    }

    // PATCH — edit (requires ?id=)
    if (req.method === "PATCH" && id) {
      const raw = req.body;
      const body =
        raw && typeof raw === "object" && !Buffer.isBuffer(raw)
          ? raw
          : JSON.parse(raw || "{}");
      const updates = {};
      if (body.amount != null) updates.amount = Number(body.amount);
      if (body.description) updates.description = String(body.description).trim();
      if (body.date) updates.date = body.date;
      const { data, error } = await sb
        .from("expenses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, expense: data });
    }

    // DELETE — remove (requires ?id=)
    if (req.method === "DELETE" && id) {
      const { error } = await sb.from("expenses").delete().eq("id", id);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("[api/expenses]", err);
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
};
