const { setCorsJson } = require("../lib/cors");
const { requireAuth } = require("../lib/auth");
const { isFirebase } = require("../lib/sourceName");
const { LifecycleError } = require("../lib/lifecycle");

// Lalamove API actions for one booking (staff only):
//
//   GET  ?action=status                          is the API set up? sandbox or production?
//   POST ?action=quote   { ref, kind }           price a delivery / return trip
//   POST ?action=book    { ref, kind, serial? }  place the order (delivery also releases the unit)
//   POST ?action=sync    { ref, kind }           pull the latest status from Lalamove
//   POST ?action=cancel  { ref, kind }           cancel the active order
//   POST ?action=simulate { ref, kind }          sandbox only: move the order one step (demo)
//
// kind is "delivery" or "return". See lib/lalamoveBookings.js.
// This is the 12th serverless function — the Vercel Hobby limit.

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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!requireAuth(req, res)) return;
  if (!isFirebase()) return res.status(400).json({ ok: false, error: "Lalamove needs DATASOURCE=firebase." });

  const lalamove = require("../lib/lalamove");
  const { shopReady } = require("../lib/shop");
  const action = req.query?.action;

  if (req.method === "GET" && action === "status") {
    return res.status(200).json({
      ok: true,
      configured: lalamove.isConfigured(),
      env: lalamove.config().env,
      shopReady: shopReady(),
    });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const body = parseJson(req.body);
  if (!body) return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  const ref = String(body.ref || "").trim();
  if (!ref) return res.status(400).json({ ok: false, error: "ref is required" });

  const flow = require("../lib/lalamoveBookings");
  try {
    if (action === "quote") return res.status(200).json({ ok: true, quote: await flow.quoteLeg(ref, body.kind) });
    if (action === "book") return res.status(200).json({ ok: true, booking: await flow.bookLeg(ref, body.kind, { serial: body.serial }) });
    if (action === "sync") return res.status(200).json({ ok: true, booking: await flow.syncLeg(ref, body.kind, { force: true }) });
    if (action === "cancel") return res.status(200).json({ ok: true, booking: await flow.cancelLeg(ref, body.kind) });
    if (action === "simulate") return res.status(200).json({ ok: true, booking: await flow.simulateLeg(ref, body.kind) });
    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (err) {
    if (err instanceof LifecycleError || err instanceof lalamove.LalamoveError) {
      return res.status(err.status || 400).json({ ok: false, error: err.message });
    }
    console.error(`[api/lalamove action=${action}]`, err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
