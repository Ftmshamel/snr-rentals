// No default API on purpose. The old default was the live MongoDB/Supabase
// deployment (real bookings); a build of this Firebase version must never
// send bookings there by accident. Set VITE_API_BASE_URL (see .env.example).
function apiBase() {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const base = typeof raw === "string" ? raw.replace(/\/$/, "") : "";
  if (!base) {
    throw new Error("VITE_API_BASE_URL is not set — cannot reach the booking API.");
  }
  return base;
}

export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase()}${p}`;
}

export async function apiGetJson(path) {
  const res = await fetch(apiUrl(path));
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

export async function apiPostJson(path, body) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || res.statusText || "Request failed");
  return data;
}
