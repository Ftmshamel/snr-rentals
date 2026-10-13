import { useEffect, useState } from "react";
import { apiGetJson } from "../utils/api.js";

// Is the Lalamove API set up on the backend (key + shop location)? Asked once
// per page load; when it isn't, the admin books Lalamove by hand.
let cached = null;
let inflight = null;

export function useLalamoveStatus() {
  const [status, setStatus] = useState(cached || { loading: true, configured: false, shopReady: false, env: "" });
  useEffect(() => {
    if (cached) return;
    inflight =
      inflight ||
      apiGetJson("/api/lalamove?action=status")
        .then((d) => (cached = { loading: false, configured: Boolean(d.configured), shopReady: Boolean(d.shopReady), env: d.env }))
        .catch(() => (cached = { loading: false, configured: false, shopReady: false, env: "" }));
    let alive = true;
    inflight.then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return { ...status, ready: status.configured && status.shopReady };
}
