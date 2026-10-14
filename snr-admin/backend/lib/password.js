const crypto = require("crypto");

// Admin passwords are stored only as scrypt hashes (in environment
// variables), never in the code. Format: scrypt:N:r:p:<salt>:<hash>
// (base64url — no "$", "+" or "/", so it survives being pasted into any shell).
// Generate one with: node scripts/hash-password.js
const N = 16384, R = 8, P = 1, KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt:${N}:${R}:${P}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64url");
  let actual;
  try {
    actual = crypto.scryptSync(String(password), Buffer.from(saltB64, "base64url"), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
