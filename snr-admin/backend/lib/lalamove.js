const crypto = require("crypto");

// Lalamove API v3 client — books riders straight from the admin.
//
// Environment (Vercel project of this backend; never in code or the frontend):
//   LALAMOVE_API_KEY, LALAMOVE_API_SECRET   from the Lalamove Partner Portal (Developers tab)
//   LALAMOVE_ENV        "sandbox" (default) or "production". Production orders cost real money.
//   LALAMOVE_MARKET     "PH" (default)
//   LALAMOVE_BASE_URL   optional override (tests point it at a local mock)
//
// Auth: every request carries
//   Authorization: hmac <API_KEY>:<timestamp ms>:<signature>
//   signature = HMAC-SHA256(secret, "<ts>\r\n<METHOD>\r\n<path>\r\n\r\n<body>") as hex
// plus Market and a unique Request-ID.
//
// ⚠ Written from Lalamove's v3 documentation without access to their servers
// from the development environment; the first real check is a sandbox order
// from the deployed admin. If Lalamove rejects a request, its error message is
// passed through to the admin as-is.

class LalamoveError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function config() {
  const key = (process.env.LALAMOVE_API_KEY || "").trim();
  const secret = (process.env.LALAMOVE_API_SECRET || "").trim();
  const env = (process.env.LALAMOVE_ENV || "sandbox").trim().toLowerCase();
  const base =
    (process.env.LALAMOVE_BASE_URL || "").trim().replace(/\/$/, "") ||
    (env === "production" ? "https://rest.lalamove.com" : "https://rest.sandbox.lalamove.com");
  return { key, secret, env, base, market: (process.env.LALAMOVE_MARKET || "PH").trim() };
}

function isConfigured() {
  const c = config();
  return Boolean(c.key && c.secret);
}

function signature(secret, ts, method, path, body) {
  const raw = `${ts}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

async function call(method, path, payload) {
  const c = config();
  if (!c.key || !c.secret) throw new LalamoveError("Lalamove is not set up (missing API key/secret).", 400);
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const ts = Date.now().toString();
  const res = await fetch(c.base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `hmac ${c.key}:${ts}:${signature(c.secret, ts, method, path, body)}`,
      Market: c.market,
      "Request-ID": crypto.randomUUID(),
    },
    body: body || undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const first = Array.isArray(json.errors) ? json.errors[0] : null;
    const detail = first ? [first.id, first.message, first.detail].filter(Boolean).join(" — ") : text.slice(0, 200);
    throw new LalamoveError(`Lalamove ${res.status}: ${detail || res.statusText}`, res.status >= 500 ? 502 : 400);
  }
  return json.data ?? json;
}

/** "0917 222 3344" → "+639172223344" (Lalamove wants E.164). */
function toE164(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("63")) return `+${digits}`;
  if (digits.startsWith("0")) return `+63${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `+63${digits}`;
  return digits ? `+${digits}` : "";
}

function stop({ lat, lng, address }) {
  return { coordinates: { lat: String(lat), lng: String(lng) }, address };
}

/**
 * Price a trip. `from` / `to` are { lat, lng, address }.
 * @returns {{ quotationId, total, currency, expiresAt, stops }}
 */
async function quote(from, to, serviceType = "MOTORCYCLE") {
  const data = await call("POST", "/v3/quotations", {
    data: {
      serviceType,
      language: "en_PH",
      stops: [stop(from), stop(to)],
      isRouteOptimized: false,
    },
  });
  return {
    quotationId: data.quotationId,
    total: Number(data.priceBreakdown?.total ?? 0),
    currency: data.priceBreakdown?.currency || "PHP",
    expiresAt: data.expiresAt || null,
    stops: data.stops || [],
    serviceType: data.serviceType || serviceType,
  };
}

/**
 * Place an order from a fresh quotation.
 * sender / recipient: { name, phone, remarks? }
 */
async function placeOrder(quotation, sender, recipient, metadata = {}) {
  const [pick, drop] = quotation.stops;
  if (!pick?.stopId || !drop?.stopId) throw new LalamoveError("Lalamove quotation came back without stops.", 502);
  const data = await call("POST", "/v3/orders", {
    data: {
      quotationId: quotation.quotationId,
      sender: { stopId: pick.stopId, name: sender.name, phone: toE164(sender.phone) },
      recipients: [
        { stopId: drop.stopId, name: recipient.name, phone: toE164(recipient.phone), remarks: recipient.remarks || "" },
      ],
      isPODEnabled: false,
      metadata,
    },
  });
  return summarize(data, quotation);
}

async function getOrder(orderId) {
  return summarize(await call("GET", `/v3/orders/${encodeURIComponent(orderId)}`));
}

async function getDriver(orderId, driverId) {
  const d = await call("GET", `/v3/orders/${encodeURIComponent(orderId)}/drivers/${encodeURIComponent(driverId)}`);
  return { name: d.name || "", phone: d.phone || "", plateNumber: d.plateNumber || "" };
}

async function cancelOrder(orderId) {
  await call("DELETE", `/v3/orders/${encodeURIComponent(orderId)}`);
}

/** The bits of a Lalamove order the booking keeps. */
function summarize(data, quotation) {
  return {
    orderId: data.orderId,
    status: data.status || "ASSIGNING_DRIVER",
    shareLink: data.shareLink || null,
    driverId: data.driverId || "",
    total: Number(data.priceBreakdown?.total ?? quotation?.total ?? 0),
    currency: data.priceBreakdown?.currency || quotation?.currency || "PHP",
  };
}

// Lalamove order statuses.
const ACTIVE = new Set(["ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP"]);
const FAILED = new Set(["CANCELED", "REJECTED", "EXPIRED"]);

module.exports = {
  LalamoveError,
  config,
  isConfigured,
  signature,
  toE164,
  quote,
  placeOrder,
  getOrder,
  getDriver,
  cancelOrder,
  ACTIVE,
  FAILED,
};
