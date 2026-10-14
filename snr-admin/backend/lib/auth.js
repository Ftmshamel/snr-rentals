const { verifySession } = require("./session");

function session(req) {
  const header = (req.headers && req.headers.authorization) || "";
  const m = header.match(/^Bearer (.+)$/);
  return m ? verifySession(m[1]) : null;
}

/** Any logged-in user (admin or owner). Returns the session, or false. */
function requireAuth(req, res) {
  const s = session(req);
  if (s) return s;
  res.status(401).json({ ok: false, error: "Unauthorized" });
  return false;
}

/** Owner only. A staff session gets 403, so the UI can say why. */
function requireOwner(req, res, message = "Only the owner can do this. Log in as owner.") {
  const s = session(req);
  if (s?.role === "owner") return s;
  if (s) {
    res.status(403).json({ ok: false, error: message });
    return false;
  }
  res.status(401).json({ ok: false, error: "Unauthorized" });
  return false;
}

module.exports = { requireAuth, requireOwner, session };
