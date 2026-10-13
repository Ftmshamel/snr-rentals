import { useEffect, useState } from "react";
import { apiGetJson } from "../utils/api.js";

// The camera lineup, prices and add-ons come from the booking API
// (GET /api/catalog → Firestore), edited by the owner on the admin Catalog
// page. Nothing here is hardcoded any more: a stale copy would advertise and
// quote prices the owner has already changed.
//
// Hidden cameras (active: false) are left out — they can't be booked online.

function tierLabel(t) {
  if (t.maxDays === null || t.maxDays === undefined) return `${t.minDays}+ days`;
  if (t.minDays === t.maxDays) return `${t.minDays} day${t.minDays === 1 ? "" : "s"}`;
  return `${t.minDays} - ${t.maxDays} days`;
}

function normalizeCamera(c) {
  return {
    ...c,
    tag: c.tag || "",
    inclusions: Array.isArray(c.inclusions) ? c.inclusions : [],
    addOns: Array.isArray(c.addOns) ? c.addOns : [],
    pricing: (c.pricing || []).map((t) => ({ ...t, label: tierLabel(t) })),
  };
}

let state = { cameras: [], loading: true, error: null };
let request = null;
const listeners = new Set();

function load() {
  if (!request) {
    request = apiGetJson("/api/catalog")
      .then((data) => {
        const cameras = (Array.isArray(data.cameras) ? data.cameras : [])
          .filter((c) => c.active !== false)
          .map(normalizeCamera);
        state = { cameras, loading: false, error: null };
      })
      .catch((err) => {
        state = { cameras: [], loading: false, error: err?.message || "Could not load cameras." };
        request = null; // allow a retry on the next mount
      })
      .finally(() => listeners.forEach((fn) => fn(state)));
  }
  return request;
}

/** @returns {{ cameras: object[], loading: boolean, error: string|null }} */
export function useCatalog() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    if (state.loading || state.error) load();
    setSnapshot(state);
    return () => listeners.delete(setSnapshot);
  }, []);
  return snapshot;
}

/** Case-insensitive lookup — links and old drafts may differ in casing. */
export function findCamera(cameras, name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  return (cameras || []).find((c) => String(c.name).trim().toLowerCase() === key) || null;
}
