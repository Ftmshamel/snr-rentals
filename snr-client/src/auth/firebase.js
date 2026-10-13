// Optional Google sign-in for renters (Firebase Authentication).
//
// Set in the renter-side Vercel project (Firebase console → Project settings →
// Your apps → Web app). These are public identifiers, not secrets:
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
//   VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID
// Without them sign-in is simply hidden and everyone books as a guest.
//
// The Firebase SDK is loaded on demand (dynamic import), so the landing page
// doesn't download it until someone actually uses an account feature.

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const authEnabled = Boolean(config.apiKey && config.authDomain && config.projectId);

let authPromise = null;

/** { auth, mod } — the Auth instance and the firebase/auth module. */
export function loadAuth() {
  if (!authEnabled) return Promise.reject(new Error("Sign-in is not set up."));
  if (!authPromise) {
    authPromise = Promise.all([import("firebase/app"), import("firebase/auth")]).then(([app, mod]) => {
      const fbApp = app.getApps()[0] || app.initializeApp(config);
      const auth = mod.getAuth(fbApp);
      // Local testing against the Auth emulator.
      if (env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
        mod.connectAuthEmulator(auth, env.VITE_FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: true });
      }
      return { auth, mod };
    });
  }
  return authPromise;
}
