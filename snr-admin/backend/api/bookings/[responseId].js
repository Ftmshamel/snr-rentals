const { setCorsJson } = require("../../lib/cors");
const { requireAuth } = require("../../lib/auth");
const {
  findBookingByResponseId,
  updateBookingByResponseId,
  deleteBookingByResponseId,
} = require("../../lib/dataSource");

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, DELETE, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (!requireAuth(req, res)) return;

  const responseId = req.query && req.query.responseId;

  if (req.method === "GET") {
    try {
      const booking = await findBookingByResponseId(responseId || "");
      if (!booking) return res.status(404).json({ ok: false, error: "Not found" });
      return res.status(200).json({ ok: true, booking });
    } catch (err) {
      console.error("[api/bookings/:responseId GET]", err);
      return res.status(500).json({ ok: false, error: err.message || "Server error" });
    }
  }

  if (req.method === "PATCH") {
    try {
      const raw = req.body;
      const body =
        raw && typeof raw === "object" && !Buffer.isBuffer(raw)
          ? raw
          : JSON.parse(raw || "{}");
      const booking = await updateBookingByResponseId(responseId || "", body);
      if (!booking) return res.status(404).json({ ok: false, error: "Not found" });
      return res.status(200).json({ ok: true, booking });
    } catch (err) {
      console.error("[api/bookings/:responseId PATCH]", err);
      return res.status(500).json({ ok: false, error: err.message || "Server error" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const deleted = await deleteBookingByResponseId(responseId || "");
      if (!deleted) return res.status(404).json({ ok: false, error: "Not found" });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[api/bookings/:responseId DELETE]", err);
      return res.status(500).json({ ok: false, error: err.message || "Server error" });
    }
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
