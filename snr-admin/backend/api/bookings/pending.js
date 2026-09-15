const { setCorsJson } = require("../../lib/cors");
const { requireAuth } = require("../../lib/auth");
const { findPendingBookings } = require("../../lib/dataSource");

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const bookings = await findPendingBookings();
    return res.status(200).json({ ok: true, bookings });
  } catch (err) {
    console.error("[api/bookings/pending]", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
