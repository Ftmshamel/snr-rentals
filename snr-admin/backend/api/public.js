const { setCorsJson } = require("../lib/cors");

// Every public (no-login) route except /api/submit and GET /api/catalog,
// multiplexed on one serverless function to stay under Vercel Hobby's
// 12-function limit:
//
//   GET  ?action=availability&camera=&pickUpDate=&returnDate=&pickUpTime=&returnTime=
//   GET  ?action=verify-renter&ref=      repeat-renter check (prefills the form)
//   GET  ?action=track&ref=              a renter's own booking status + Lalamove links
//   POST ?action=return-details          renter updates where the return is collected
const HANDLERS = {
  availability: require("../lib/public/availability"),
  "verify-renter": require("../lib/public/verifyRenter"),
  track: require("../lib/public/track"),
  "return-details": require("../lib/public/returnDetails"),
};

function getQuery(req) {
  if (req.query && Object.keys(req.query).length > 0) return req.query;
  const url = new URL(req.url || "", "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.status(204).end();

  const query = getQuery(req);
  const action = Array.isArray(query.action) ? query.action[0] : query.action;
  const handler = HANDLERS[action];
  if (!handler) return res.status(400).json({ ok: false, error: "Unknown action" });
  try {
    return await handler(req, res, query);
  } catch (err) {
    console.error(`[api/public action=${action}]`, err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
