const DEFAULT_API_BASE = "https://s-r-rentals-app.vercel.app";

function apiBase() {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const base = typeof raw === "string" ? raw.replace(/\/$/, "") : "";
  return base || DEFAULT_API_BASE;
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
