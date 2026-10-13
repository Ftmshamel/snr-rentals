const AUTH_TOKEN = "snr-rentals-session-2026-07-07";
// Owners get their own token so owner-only writes (the camera catalogue) can
// be enforced on the server, not just hidden in the UI. Set OWNER_TOKEN in the
// environment; the fallback only keeps local development working.
const OWNER_TOKEN = process.env.OWNER_TOKEN || `${AUTH_TOKEN}-owner`;

const AUTH_USERS = [
  {
    username: process.env.ADMIN_USERNAME || "admin",
    password: "admin123",
    role: "admin",
  },
  {
    username: process.env.OWNER_USERNAME || "owner",
    password: "owner4831",
    role: "owner",
  },
];

module.exports = { AUTH_TOKEN, OWNER_TOKEN, AUTH_USERS };
