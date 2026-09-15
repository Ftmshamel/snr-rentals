const { AUTH_TOKEN } = require("./authConfig");

function requireAuth(req, res) {
  const header = (req.headers && req.headers.authorization) || "";
  if (header === `Bearer ${AUTH_TOKEN}`) return true;
  res.status(401).json({ ok: false, error: "Unauthorized" });
  return false;
}

module.exports = { requireAuth };
