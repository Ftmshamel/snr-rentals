import { useEffect, useState } from "react";
import { authEnabled, loadAuth } from "../auth/firebase.js";
import { apiUrl } from "../utils/api.js";

// The signed-in renter, shared by every component (header, booking form,
// account page). `me` is the server's view — tier, progress, perks, bookings —
// from GET /api/public?action=me. The client never decides a tier itself.
//
//   status: "off"      sign-in not configured (guest only)
//           "loading"  checking for a session / loading the account
//           "guest"    not signed in
//           "member"   signed in and `me` loaded (or `error` says why not)
//
// Sign-in methods: Google, Facebook, email + password — whichever are listed
// in VITE_AUTH_PROVIDERS (default "google,email") AND enabled in Firebase
// console → Authentication → Sign-in method. The sign-in window is
// components/SignInModal.jsx; open it with openSignIn().

let state = { status: authEnabled ? "loading" : "off", user: null, me: null, error: null };
const listeners = new Set();
let started = false;
// Remembers that this browser was signed in, so the header can show a
// placeholder while the session is restored instead of flashing "Sign in".
const HINT_KEY = "snr-member-hint";

function publish(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

async function authed(path, init = {}) {
  const token = await getIdToken();
  if (!token) throw new Error("Please sign in first.");
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

export async function getIdToken() {
  if (!authEnabled) return null;
  const { auth } = await loadAuth();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export async function refreshMe() {
  try {
    const me = await authed("/api/public?action=me");
    publish({ me, error: null });
    return me;
  } catch (err) {
    publish({ error: err.message });
    return null;
  }
}

function start() {
  if (started || !authEnabled) return;
  started = true;
  loadAuth()
    .then(({ auth, mod }) => {
      mod.onAuthStateChanged(auth, async (user) => {
        if (!user) {
          try { localStorage.removeItem(HINT_KEY); } catch { /* storage blocked */ }
          publish({ status: "guest", user: null, me: null });
          return;
        }
        try { localStorage.setItem(HINT_KEY, "1"); } catch { /* storage blocked */ }
        // Stay "loading" until the account has arrived, so pages switch to
        // the member view once, complete — no half-filled header or home.
        publish({ user: { name: user.displayName, email: user.email, photo: user.photoURL } });
        await refreshMe();
        publish({ status: "member" });
      });
    })
    .catch((err) => publish({ status: "guest", error: err.message }));
}

const PROVIDERS = String(import.meta.env.VITE_AUTH_PROVIDERS || "google,email")
  .split(",")
  .map((p) => p.trim().toLowerCase())
  .filter((p) => ["google", "facebook", "email"].includes(p));

export function signInProviders() {
  return PROVIDERS;
}

/** Google or Facebook, in a popup (a full-page redirect where popups are blocked). */
export async function signInWith(providerName) {
  const { auth, mod } = await loadAuth();
  const provider = providerName === "facebook" ? new mod.FacebookAuthProvider() : new mod.GoogleAuthProvider();
  if (providerName !== "facebook") provider.setCustomParameters({ prompt: "select_account" });
  try {
    await mod.signInWithPopup(auth, provider);
    return true;
  } catch (err) {
    // Phones and in-app browsers (Messenger, Facebook) often block popups.
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(err?.code)) {
      await mod.signInWithRedirect(auth, provider);
      return false;
    }
    // Closed the popup: not an error, just not signed in.
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return false;
    throw err;
  }
}

/** Kept for callers that just want Google. */
export function signIn() {
  return signInWith("google");
}

export async function signInWithEmail(email, password) {
  const { auth, mod } = await loadAuth();
  await mod.signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function createEmailAccount(name, email, password) {
  const { auth, mod } = await loadAuth();
  const cred = await mod.createUserWithEmailAndPassword(auth, email.trim(), password);
  await mod.updateProfile(cred.user, { displayName: name.trim() });
  // A fresh token carries the name, so the server records it.
  await cred.user.getIdToken(true);
  publish({ user: { ...(state.user || {}), name: name.trim(), email: cred.user.email } });
  await refreshMe();
}

export async function sendPasswordReset(email) {
  const { auth, mod } = await loadAuth();
  await mod.sendPasswordResetEmail(auth, email.trim());
}

/** Firebase error → what to tell the renter. */
export function signInErrorMessage(err) {
  const messages = {
    "auth/invalid-credential": "Wrong email or password.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/user-not-found": "No account with that email yet — create one below.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/missing-password": "Enter your password.",
    "auth/email-already-in-use": "That email already has an account — sign in instead.",
    "auth/weak-password": "Use at least 6 characters for your password.",
    "auth/operation-not-allowed": "This sign-in option isn't turned on yet. Try another one.",
    "auth/account-exists-with-different-credential":
      "You already have an account with this email using another option (like Google). Sign in with that one.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "No internet connection. Check it and try again.",
    "auth/unauthorized-domain": "Sign-in isn't allowed on this web address yet.",
    "auth/user-disabled": "This account has been disabled. Message us on Facebook.",
  };
  return messages[err?.code] || err?.message || "Sign-in failed. Please try again.";
}

// The sign-in window is opened from anywhere (header, booking form, rewards).
let modalState = { open: false };
const modalListeners = new Set();
export function openSignIn() {
  modalState = { open: true };
  modalListeners.forEach((fn) => fn(modalState));
}
export function closeSignIn() {
  modalState = { open: false };
  modalListeners.forEach((fn) => fn(modalState));
}
export function useSignInModal() {
  const [snapshot, setSnapshot] = useState(modalState);
  useEffect(() => {
    modalListeners.add(setSnapshot);
    return () => modalListeners.delete(setSnapshot);
  }, []);
  return snapshot;
}

export async function signOut() {
  const { auth, mod } = await loadAuth();
  await mod.signOut(auth);
}

export async function claimBooking(ref) {
  const me = await authed("/api/public?action=claim", { method: "POST", body: JSON.stringify({ ref }) });
  publish({ me });
  return me;
}

/** True when this browser was signed in last time (show a placeholder, not "Sign in"). */
export function wasSignedIn() {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Signed in, or very likely about to be (session still restoring). */
export function looksSignedIn(member) {
  return member.status === "member" || (member.status === "loading" && wasSignedIn());
}

export function useMember() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    start();
    setSnapshot(state);
    return () => listeners.delete(setSnapshot);
  }, []);
  return snapshot;
}
