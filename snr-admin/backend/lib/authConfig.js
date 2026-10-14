// Admin panel accounts. Usernames and password HASHES come from the
// environment — no password is in the code. Generate a hash with
//   node scripts/hash-password.js
// and set, on the API's Vercel project:
//   AUTH_SECRET            random, 32+ characters (signs session tokens)
//   OWNER_USERNAME         OWNER_PASSWORD_HASH   (catalogue, prices, tiers, privacy erasure)
//   ADMIN_USERNAME         ADMIN_PASSWORD_HASH   (staff)
function adminUsers() {
  return [
    { username: process.env.OWNER_USERNAME || "owner", passwordHash: process.env.OWNER_PASSWORD_HASH || "", role: "owner" },
    { username: process.env.ADMIN_USERNAME || "admin", passwordHash: process.env.ADMIN_PASSWORD_HASH || "", role: "admin" },
  ].filter((u) => u.passwordHash);
}

module.exports = { adminUsers };
