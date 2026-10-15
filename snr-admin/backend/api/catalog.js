const { setCorsJson } = require("../lib/cors");
const { requireOwner } = require("../lib/auth");
const { isFirebase } = require("../lib/sourceName");
const { CatalogValidationError, todayManila } = require("../lib/catalog");
const { DEFAULT_CATALOG } = require("../lib/defaultCatalog");
const { LoyaltyError } = require("../lib/loyalty");

// The camera catalogue — names, units, day rates, add-ons, inclusions.
//
//   GET                       public: every camera (the public site filters
//                             out `active: false`; the admin shows all)
//   POST                      owner: add a camera            body: { camera }
//   POST   ?action=seed       owner: add the DEFAULT_CATALOG items the catalogue lacks (all, when empty)
//   PATCH  ?id=<id>           owner: edit                    body: { camera, effectiveDate }
//   DELETE ?id=<id>           owner: remove
//   GET    ?action=members    owner: renter accounts with their tier
//   PATCH  ?action=tiers      owner: member tiers + perks   body: { tiers }
//
// A changed price or unit count is never overwritten in place: the old value
// is kept in history up to `effectiveDate` (default: today, Manila time) so
// bookings before that date keep their fee and availability. See lib/catalog.js.
//
// This is the 12th serverless function — the Vercel Hobby limit. Anything new
// must multiplex onto an existing route.

function parseJson(raw) {
  if (raw && typeof raw === "object" && !Buffer.isBuffer(raw)) return raw;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (!isFirebase()) {
    // The legacy stores have no catalogue table; their prices are the static
    // lists in the code. Serve the defaults read-only so pages still render.
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, cameras: DEFAULT_CATALOG, readOnly: true });
    }
    return res
      .status(400)
      .json({ ok: false, error: "The catalogue can only be edited with DATASOURCE=firebase." });
  }

  const store = require("../lib/firestoreQueries");
  const id = req.query?.id;
  const action = req.query?.action;

  try {
    if (req.method === "GET" && action === "members") {
      if (!requireOwner(req, res)) return;
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, members: await store.listMembers() });
    }

    if (req.method === "GET") {
      // No CDN caching: the admin re-reads this right after saving an edit.
      // `tiers` — the member tiers and perks, shown on the public site.
      res.setHeader("Cache-Control", "no-store");
      const [cameras, tiers] = await Promise.all([store.listCameras(), store.getLoyaltyTiers()]);
      // `missingDefaults` — price-list items not in the catalogue yet; the
      // owner's Catalog page offers to add them (POST ?action=seed).
      const missingDefaults = store.missingDefaultNames(cameras, DEFAULT_CATALOG);
      return res.status(200).json({ ok: true, cameras, tiers, missingDefaults });
    }

    if (!requireOwner(req, res)) return;
    const body = parseJson(req.body);
    if (body === null) return res.status(400).json({ ok: false, error: "Invalid JSON body" });

    if (req.method === "PATCH" && action === "tiers") {
      return res.status(200).json({ ok: true, tiers: await store.saveLoyaltyTiers(body.tiers) });
    }

    if (req.method === "POST" && action === "seed") {
      const cameras = await store.seedCameras(DEFAULT_CATALOG);
      return res.status(201).json({ ok: true, cameras });
    }

    if (req.method === "POST") {
      const camera = await store.createCamera(body.camera || {});
      return res.status(201).json({ ok: true, camera });
    }

    if (req.method === "PATCH" && id) {
      const effectiveDate = body.effectiveDate || todayManila();
      const camera = await store.updateCamera(id, body.camera || {}, effectiveDate);
      if (!camera) return res.status(404).json({ ok: false, error: "Camera not found" });
      return res.status(200).json({ ok: true, camera });
    }

    if (req.method === "DELETE" && id) {
      const deleted = await store.deleteCamera(id);
      if (!deleted) return res.status(404).json({ ok: false, error: "Camera not found" });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof CatalogValidationError || err instanceof LoyaltyError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error("[api/catalog]", err);
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
};
