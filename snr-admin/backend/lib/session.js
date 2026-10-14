const crypto = require("crypto");

// Admin sessions: a signed, expiring token (JWT, HS256) instead of a fixed
// string. The role inside is what the server trusts; it can't be edited
// without AUTH_SECRET. Tokens last SESSION_HOURS, then the admin logs in again.
const SESSION_HOURS = 12;

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

function secret() {
  const s = process.env.AUTH_SECRET || "";
  return s.length >= 32 ? s : null;
}

function signSession({ username, role }, now = Date.now()) {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET is not set (at least 32 characters).");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const iat = Math.floor(now / 1000);
  const payload = b64url(JSON.stringify({ sub: username, role, iat, exp: iat + SESSION_HOURS * 3600 }));
  const sig = b64url(crypto.createHmac("sha256", key).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

/** The session's { sub, role }, or null if missing, forged or expired. */
function verifySession(token, now = Date.now()) {
  const key = secret();
  const parts = String(token || "").split(".");
  if (!key || parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto.createHmac("sha256", key).update(`${header}.${payload}`).digest();
  const given = fromB64url(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    if (JSON.parse(fromB64url(header).toString()).alg !== "HS256") return null;
    const claims = JSON.parse(fromB64url(payload).toString());
    if (!claims.exp || claims.exp * 1000 <= now) return null;
    if (claims.role !== "owner" && claims.role !== "admin") return null;
    return claims;
  } catch {
    return null;
  }
}

module.exports = { signSession, verifySession, SESSION_HOURS };
