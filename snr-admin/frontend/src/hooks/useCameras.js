import { useEffect, useState } from "react";
import { apiGetJson } from "../utils/api.js";

// The camera catalogue, loaded once from GET /api/catalog (Firestore) and
// shared by every component that asks for it. Edits on the Catalog page call
// reloadCameras() so every open page sees the new prices immediately.
//
// There is deliberately no fallback to a hardcoded list: a stale copy would
// quote and charge prices the owner has already changed.

let state = { cameras: [], loading: true, error: null, loaded: false };
let inflight = null;
const listeners = new Set();

function publish(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

export function reloadCameras() {
  if (!inflight) {
    publish({ loading: true, error: null });
    inflight = apiGetJson("/api/catalog")
      .then((data) => {
        publish({
          cameras: Array.isArray(data.cameras) ? data.cameras : [],
          readOnly: Boolean(data.readOnly),
          missingDefaults: Array.isArray(data.missingDefaults) ? data.missingDefaults : [],
          loading: false,
          loaded: true,
        });
      })
      .catch((err) => {
        publish({ loading: false, error: err?.message || "Failed to load cameras" });
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** @returns {{ cameras: object[], loading: boolean, error: string|null, reload: () => Promise<void> }} */
export function useCameras() {
  const [snapshot, setSnapshot] = useState(state);

  useEffect(() => {
    listeners.add(setSnapshot);
    if (!state.loaded && !inflight) reloadCameras();
    else setSnapshot(state);
    return () => listeners.delete(setSnapshot);
  }, []);

  return { ...snapshot, reload: reloadCameras };
}

/** Case-insensitive lookup — bookings store the name as typed at the time. */
export function findCamera(cameras, name) {
  const key = String(name || "").trim().toLowerCase();
  return (cameras || []).find((c) => String(c.name).trim().toLowerCase() === key) || null;
}
