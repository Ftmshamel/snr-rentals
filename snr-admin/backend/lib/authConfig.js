// Admin panel accounts. Usernames and password HASHES come from the
// environment — no password is in the code. Generate a hash with
//   node scripts/hash-password.js
// and set, on the API's Vercel project:
//   AUTH_SECRET            random, 32+ characters (signs session tokens)
//   OWNER_USERNAME         OWNER_PASSWORD_HASH   (catalogue, prices, tiers, privacy erasure)
//   ADMIN_USERNAME         ADMIN_PASSWORD_HASH   (staff)
const HASH_FORMAT = /^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;

// Values pasted into Vercel from a terminal often carry a wrapped line break,
// spaces, quotes or the "NAME=" prefix itself. Tolerate all of those.
function cleanHash(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .replace(/^["']|["']$/g, "")
    .replace(/^[A-Z_]+=/, "");
}

function adminUsers() {
  return [
    { env: "OWNER_PASSWORD_HASH", username: process.env.OWNER_USERNAME, fallback: "owner", role: "owner" },
    { env: "ADMIN_PASSWORD_HASH", username: process.env.ADMIN_USERNAME, fallback: "admin", role: "admin" },
  ]
    .map((u) => ({
      username: String(u.username || u.fallback).trim().toLowerCase(),
      passwordHash: cleanHash(process.env[u.env]),
      role: u.role,
      env: u.env,
    }))
    .filter((u) => u.passwordHash);
}

/** Names of hash variables that are set but aren't a valid hash. */
function hashProblems(users = adminUsers()) {
  return users.filter((u) => !HASH_FORMAT.test(u.passwordHash)).map((u) => u.env);
}

module.exports = { adminUsers, hashProblems, cleanHash };
