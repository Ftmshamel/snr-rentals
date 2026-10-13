const admin = require("firebase-admin");
const { getFirestore } = require("./firebase");

// Renters sign in on the public site with Google (Firebase Authentication)
// and send their Firebase ID token. The server never trusts a uid or tier
// from the client — it verifies the token and works the tier out itself.
//
// Uses the same firebase-admin app as Firestore (FIREBASE_SERVICE_ACCOUNT).
// With FIREBASE_AUTH_EMULATOR_HOST set (local tests) the SDK accepts tokens
// from the Auth emulator instead.

class RenterAuthError extends Error {}

function bearerToken(req) {
  const header = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/** @returns {{ uid, email, name, picture }} or throws RenterAuthError */
async function verifyRenterToken(token) {
  if (!token) throw new RenterAuthError("Please sign in first.");
  getFirestore(); // initialises the firebase-admin app
  try {
    const t = await admin.auth().verifyIdToken(token);
    return { uid: t.uid, email: t.email || "", name: t.name || "", picture: t.picture || "" };
  } catch {
    throw new RenterAuthError("Your sign-in has expired. Please sign in again.");
  }
}

module.exports = { RenterAuthError, bearerToken, verifyRenterToken };
