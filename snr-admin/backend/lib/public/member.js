const { isFirebase } = require("../sourceName");
const { isRateLimited } = require("./rateLimit");
const { RenterAuthError, bearerToken, verifyRenterToken } = require("../renterAuth");
const { LoyaltyError } = require("../loyalty");

// A signed-in renter's own account (public site, Google sign-in):
//
//   GET  ?action=me       tier, progress, every tier's perks, their bookings,
//                         and details to prefill the booking form
//   POST ?action=claim    { ref } — add a past booking to the account
//
// Both need `Authorization: Bearer <Firebase ID token>`.

const VETTED = new Set(["approved", "completed"]);
const RELEASED = new Set(["out_for_delivery", "out", "returned"]);

function bookingCard(b, publicStage) {
  return {
    ref: b.responseId,
    camera: b.PREFERRED_CAMERA,
    unitSerial: RELEASED.has(b.FULFILLMENT_STATUS) ? b.UNIT_SERIAL || null : null,
    pickUpDate: b.PICK_UP_DATE,
    pickUpTime: b.PICK_UP_TIME || null,
    returnDate: b.RETURN_DATE,
    returnTime: b.RETURN_TIME || null,
    mode: /deliver/i.test(String(b.PREFERRED_MODE || "")) ? "delivery" : "pickup",
    stage: publicStage(b),
    fee: b.RENTAL_FEE ?? null,
    savings: b.MEMBER?.savings || 0,
    tierName: b.MEMBER?.tierName || null,
    // Part of a multi-camera order (same reference code for all of them).
    order: b.ORDER_REF ? { ref: b.ORDER_REF, size: b.ORDER_SIZE || null, index: b.ORDER_INDEX || null } : null,
  };
}

async function me(req, res, renter) {
  const store = require("../firestoreQueries");
  const { publicStage } = require("./track");
  await store.upsertRenter(renter);
  const status = await store.memberStatus(renter.uid);
  const newestFirst = [...status.bookings].reverse();
  const live = newestFirst.filter((b) => !["cancelled", "rejected"].includes(String(b.status).toLowerCase()));
  const latest = live[0] || null;
  // A vetted past booking lets the form skip re-uploading IDs (repeat renter).
  const vetted = live.find(
    (b) => VETTED.has(String(b.status).toLowerCase()) || RELEASED.has(b.FULFILLMENT_STATUS),
  );
  return res.status(200).json({
    ok: true,
    renter: { name: renter.name, email: renter.email, picture: renter.picture },
    completed: status.completed,
    tier: status.tier,
    next: status.next,
    toNext: status.toNext,
    tiers: status.tiers,
    bookings: newestFirst.map((b) => bookingCard(b, publicStage)),
    profile: latest
      ? {
          fullName: latest.FULL_NAME || renter.name,
          contactNumber: latest.CONTACT_NUMBER || "",
          facebookName: latest.FACEBOOK_ACCOUNT_NAME || "",
          facebookLink: latest.FACEBOOK_PROFILE_LINK || "",
          address: latest.COMPLETE_ADDRESS || "",
        }
      : { fullName: renter.name, contactNumber: "", facebookName: "", facebookLink: "", address: "" },
    repeatRef: vetted ? vetted.responseId : null,
  });
}

async function claim(req, res, renter) {
  if (isRateLimited(req, "claim", 10)) {
    return res.status(429).json({ ok: false, error: "Too many attempts. Please try again in a minute." });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const ref = String(body.ref || "").trim();
  if (!ref) return res.status(400).json({ ok: false, error: "Enter the booking's reference code." });
  const store = require("../firestoreQueries");
  await store.upsertRenter(renter);
  await store.linkBookingToRenter(ref, renter.uid);
  return me(req, res, renter);
}

module.exports = async function member(req, res, query) {
  if (!isFirebase()) return res.status(400).json({ ok: false, error: "Accounts are not available." });
  const action = Array.isArray(query.action) ? query.action[0] : query.action;
  try {
    const renter = await verifyRenterToken(bearerToken(req));
    if (action === "me" && req.method === "GET") return await me(req, res, renter);
    if (action === "claim" && req.method === "POST") return await claim(req, res, renter);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof RenterAuthError) return res.status(401).json({ ok: false, error: err.message });
    if (err instanceof LoyaltyError) return res.status(400).json({ ok: false, error: err.message });
    throw err;
  }
};
