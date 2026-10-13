const { AUTH_TOKEN, OWNER_TOKEN } = require("./authConfig");

function bearer(req) {
  return (req.headers && req.headers.authorization) || "";
}

/** Any logged-in user (admin or owner). */
function requireAuth(req, res) {
  const header = bearer(req);
  if (header === `Bearer ${AUTH_TOKEN}` || header === `Bearer ${OWNER_TOKEN}`) return true;
  res.status(401).json({ ok: false, error: "Unauthorized" });
  return false;
}

/** Owner only. An admin token gets 403, so the UI can say why. */
function requireOwner(req, res) {
  const header = bearer(req);
  if (header === `Bearer ${OWNER_TOKEN}`) return true;
  if (header === `Bearer ${AUTH_TOKEN}`) {
    res.status(403).json({ ok: false, error: "Only the owner can change the catalogue. Log in as owner." });
    return false;
  }
  res.status(401).json({ ok: false, error: "Unauthorized" });
  return false;
}

module.exports = { requireAuth, requireOwner };
