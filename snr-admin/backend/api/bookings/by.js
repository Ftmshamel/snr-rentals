const { setCorsJson } = require("../../lib/cors");
const { requireAuth } = require("../../lib/auth");
const {
  findBookingsByCamera,
  findBookingsByAddon,
} = require("../../lib/dataSource");
const { findUnmirroredBookings } = require("../../lib/unmirrored");

// GET /api/bookings/by?type=camera|addon&name=<name>
// GET /api/bookings/by?type=unmirrored          (no name required)
//
// Camera and add-on calendars share this route so the backend stays within
// Vercel's serverless-function limit — which is also why the unmirrored
// lookup lives here instead of getting its own endpoint.
const LOOKUPS = {
  camera: findBookingsByCamera,
  addon: findBookingsByAddon,
};

// Lookups that operate on the whole collection rather than a named item.
const NAMELESS_LOOKUPS = {
  unmirrored: findUnmirroredBookings,
};

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const type = (req.query && req.query.type) || "";
  const name = (req.query && req.query.name) || "";

  if (NAMELESS_LOOKUPS[type]) {
    try {
      const bookings = await NAMELESS_LOOKUPS[type]();
      return res.status(200).json({ ok: true, bookings });
    } catch (err) {
      console.error(`[api/bookings/by type=${type}]`, err);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  }

  const lookup = LOOKUPS[type];
  if (!lookup) {
    return res
      .status(400)
      .json({ ok: false, error: "type must be 'camera', 'addon' or 'unmirrored'" });
  }
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  try {
    const bookings = await lookup(name);
    return res.status(200).json({ ok: true, bookings });
  } catch (err) {
    console.error(`[api/bookings/by type=${type}]`, err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
