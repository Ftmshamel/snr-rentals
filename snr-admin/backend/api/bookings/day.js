const { setCorsJson } = require("../../lib/cors");
const { requireAuth } = require("../../lib/auth");
const { findBookingsOnDate } = require("../../lib/dataSource");

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const date = req.query && req.query.date;
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing or invalid date=YYYY-MM-DD" });
  }

  try {
    const bookings = await findBookingsOnDate(date);
    return res.status(200).json({ ok: true, bookings, date });
  } catch (err) {
    console.error("[api/bookings/day]", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
