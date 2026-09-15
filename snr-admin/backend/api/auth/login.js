const { setCorsJson } = require("../../lib/cors");
const { AUTH_TOKEN, AUTH_USERS } = require("../../lib/authConfig");

module.exports = async (req, res) => {
  setCorsJson(req, res);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const { username, password } = body;
  const match = AUTH_USERS.find(
    (u) => u.username === username && u.password === password,
  );
  if (match) {
    return res
      .status(200)
      .json({ ok: true, token: AUTH_TOKEN, role: match.role });
  }

  return res.status(401).json({ ok: false, error: "Invalid credentials" });
};
