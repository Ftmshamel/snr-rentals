const { setCorsJson } = require("../../lib/cors");
const { adminUsers, hashProblems } = require("../../lib/authConfig");
const { verifyPassword } = require("../../lib/password");
const { signSession, SESSION_HOURS } = require("../../lib/session");
const { isRateLimited } = require("../../lib/public/rateLimit");

// POST /api/auth/login { username, password } → { token, role, expiresInHours }
// Passwords are checked against scrypt hashes from the environment; the
// token is a signed session that expires (lib/session.js).
module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  // Slows down password guessing: 8 tries a minute per address.
  if (isRateLimited(req, "login", 8)) {
    return res.status(429).json({ ok: false, error: "Too many attempts. Please wait a minute." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const { username, password } = body || {};

  const users = adminUsers();
  if (users.length === 0 || !process.env.AUTH_SECRET) {
    console.error("[api/auth/login] AUTH_SECRET / *_PASSWORD_HASH are not configured");
    return res.status(503).json({ ok: false, error: "Admin login isn't set up yet on the server." });
  }

  // A set-but-broken hash would only ever say "Invalid credentials" — name it.
  const broken = hashProblems(users);
  if (broken.length) {
    console.error("[api/auth/login] not a valid scrypt hash:", broken.join(", "));
    return res.status(503).json({
      ok: false,
      error: `Admin login is set up wrong on the server: ${broken.join(" and ")} must be only the value that starts with "scrypt:".`,
    });
  }

  const match = users.find((u) => u.username === String(username || "").trim().toLowerCase());
  // Hash even for an unknown username so both cases take the same time.
  const ok = verifyPassword(String(password || ""), match ? match.passwordHash : users[0].passwordHash) && Boolean(match);
  if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

  try {
    const token = signSession({ username: match.username, role: match.role });
    return res.status(200).json({ ok: true, token, role: match.role, expiresInHours: SESSION_HOURS });
  } catch (err) {
    console.error("[api/auth/login]", err.message);
    return res.status(503).json({ ok: false, error: "Admin login isn't set up yet on the server." });
  }
};
