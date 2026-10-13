import { useEffect, useState } from "react";
import { authEnabled, loadAuth } from "../auth/firebase.js";
import { apiUrl } from "../utils/api.js";

// The signed-in renter, shared by every component (header, booking form,
// account page). `me` is the server's view — tier, progress, perks, bookings —
// from GET /api/public?action=me. The client never decides a tier itself.
//
//   status: "off"      sign-in not configured (guest only)
//           "loading"  checking for an existing session
//           "guest"    not signed in
//           "member"   signed in; `me` holds their account

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
        publish({ status: "member", user: { name: user.displayName, email: user.email, photo: user.photoURL } });
        await refreshMe();
      });
    })
    .catch((err) => publish({ status: "guest", error: err.message }));
}

export async function signIn() {
  const { auth, mod } = await loadAuth();
  const provider = new mod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await mod.signInWithPopup(auth, provider);
  } catch (err) {
    // Phones and in-app browsers (Messenger, Facebook) often block popups.
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(err?.code)) {
      await mod.signInWithRedirect(auth, provider);
      return;
    }
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return;
    throw err;
  }
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
