// Best-effort per-instance throttle for the public routes that take a
// booking reference code, so nobody can brute-force codes. Each serverless
// instance keeps its own counts; good enough to make guessing impractical.
function clientIp(req) {
  return (
    String((req.headers && req.headers["x-forwarded-for"]) || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function isRateLimited(req, bucket, limit = 20, windowMs = 60_000) {
  if (!global._snrRateLimits) global._snrRateLimits = new Map();
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const entry = global._snrRateLimits.get(key) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  global._snrRateLimits.set(key, entry);
  return entry.count > limit;
}

module.exports = { isRateLimited };
