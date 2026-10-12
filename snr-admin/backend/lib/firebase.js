const admin = require("firebase-admin");

// Firestore client for DATASOURCE=firebase.
//
// Credentials come from the environment — never commit a service-account key.
// Either of these works (first one wins):
//
//   FIREBASE_SERVICE_ACCOUNT  the whole service-account JSON, as one string
//   FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
//
// FIREBASE_PRIVATE_KEY is usually pasted with literal "\n" sequences (Vercel
// stores env vars on one line), so those are turned back into newlines.
//
// When FIRESTORE_EMULATOR_HOST is set (local testing), the SDK talks to the
// emulator and only FIREBASE_PROJECT_ID is needed.

let _db = null;

function readCredentials() {
  const json = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (json) {
    const parsed = JSON.parse(json);
    return {
      projectId: parsed.project_id,
      credential: admin.credential.cert(parsed),
    };
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return { projectId: projectId || "demo-snr-rentals" };
  }
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase is not configured: set FIREBASE_SERVICE_ACCOUNT, or " +
        "FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY",
    );
  }
  return {
    projectId,
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  };
}

function getFirestore() {
  if (_db) return _db;
  const app = admin.apps.length ? admin.app() : admin.initializeApp(readCredentials());
  _db = app.firestore();
  // Booking payloads routinely carry undefined fields (optional form answers);
  // Firestore rejects those outright unless told to skip them.
  _db.settings({ ignoreUndefinedProperties: true });
  return _db;
}

module.exports = { getFirestore };
