const { setCorsJson } = require("../../lib/cors");
const { requireAuth, requireOwner } = require("../../lib/auth");
const {
  findBookingsByCamera,
  findBookingsByAddon,
} = require("../../lib/dataSource");
const { isFirebase } = require("../../lib/sourceName");

// Un-mirrored bookings only exist in the legacy MongoDB → Supabase setup.
// Firestore is a single store with nothing to fall out of sync, so the admin
// banner always gets an empty list — and MongoDB is never opened.
async function findUnmirroredBookings() {
  if (isFirebase()) return [];
  return require("../../lib/unmirrored").findUnmirroredBookings();
}

// GET /api/bookings/by?type=camera|addon&name=<name>
// GET /api/bookings/by?type=unmirrored          (no name required)
// GET /api/bookings/by?type=privacy             data-privacy requests (owner)
// PATCH /api/bookings/by?type=privacy&id=       { status, resolution } (owner)
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

async function privacy(req, res) {
  if (!requireOwner(req, res, "Only the owner handles data privacy requests.")) return;
  if (!isFirebase()) return res.status(400).json({ ok: false, error: "Not available." });
  const store = require("../../lib/firestoreQueries");
  try {
    if (req.method === "GET") return res.status(200).json({ ok: true, requests: await store.listPrivacyRequests() });
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const request = await store.updatePrivacyRequest(req.query.id, body);
      if (!request) return res.status(404).json({ ok: false, error: "Not found" });
      return res.status(200).json({ ok: true, request });
    }
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    const { LifecycleError } = require("../../lib/lifecycle");
    if (err instanceof LifecycleError) return res.status(400).json({ ok: false, error: err.message });
    console.error("[api/bookings/by type=privacy]", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  const type = (req.query && req.query.type) || "";
  // RA 10173 requests carry renters' contact and wishes — owner only.
  if (type === "privacy") return privacy(req, res);

  if (!requireAuth(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

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
