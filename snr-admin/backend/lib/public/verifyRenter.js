const { verifyRepeatRenter } = require("../verifyRepeatRenter");

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getQuery(req) {
  if (req.query && Object.keys(req.query).length > 0) return req.query;
  const url = new URL(req.url || "", "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

// Best-effort per-instance throttle so nobody brute-forces reference codes.
function isRateLimited(ip) {
  if (!global._snrVerifyRenterHits) global._snrVerifyRenterHits = new Map();
  const hits = global._snrVerifyRenterHits;
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  hits.set(ip, entry);
  return entry.count > RATE_LIMIT;
}

module.exports = async (req, res) => {
  setCors(res);
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const ip =
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({
      ok: false,
      error: "Too many attempts. Please try again in a minute.",
    });
  }

  const query = getQuery(req);
  const ref = first(query.ref);
  if (!String(ref || "").trim()) {
    return res.status(400).json({
      ok: false,
      error: "Reference code is required.",
    });
  }

  try {
    const result = await verifyRepeatRenter(ref);
    if (!result.verified) {
      return res.status(200).json({
        ok: true,
        verified: false,
        ...(result.reason ? { reason: result.reason } : {}),
      });
    }
    return res.status(200).json({
      ok: true,
      verified: true,
      fullName: result.fullName,
      facebookName: result.facebookName,
      facebookLink: result.facebookLink,
      address: result.address,
      contactNumber: result.contactNumber,
    });
  } catch (err) {
    console.error("[api/verify-renter]", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
