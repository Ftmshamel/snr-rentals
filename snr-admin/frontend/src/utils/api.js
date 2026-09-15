const DEFAULT_PROD_API_BASE = "https://s-r-rentals-app.vercel.app";

function apiBase() {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const base = typeof raw === "string" ? raw.replace(/\/$/, "") : "";
  const useRemoteApi = import.meta.env.VITE_USE_REMOTE_API === "true";

  if (import.meta.env.DEV && !useRemoteApi) {
    return "";
  }

  return base || DEFAULT_PROD_API_BASE;
}

export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = apiBase();
  return base ? `${base}${p}` : p;
}

function authHeader() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function onUnauthorized() {
  if (localStorage.getItem("auth_token")) {
    localStorage.removeItem("auth_token");
    window.location.reload();
  }
}

export async function apiGetJson(path) {
  const res = await fetch(apiUrl(path), { headers: authHeader() });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    onUnauthorized();
    throw new Error("Unauthorized");
  }
  if (!res.ok)
    throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

export async function apiPostJson(path, body) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    onUnauthorized();
    throw new Error(data.error || "Unauthorized");
  }
  if (!res.ok)
    throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

export async function apiPatchJson(path, body) {
  const res = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    onUnauthorized();
    throw new Error(data.error || "Unauthorized");
  }
  if (!res.ok)
    throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

export async function apiDeleteJson(path) {
  const res = await fetch(apiUrl(path), {
    method: "DELETE",
    headers: authHeader(),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    onUnauthorized();
    throw new Error(data.error || "Unauthorized");
  }
  if (!res.ok)
    throw new Error(data.error || res.statusText || "Request failed");
  return data;
}
