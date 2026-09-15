const AUTH_TOKEN = "snr-rentals-session-2026-07-07";

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

module.exports = { AUTH_TOKEN, AUTH_USERS };
