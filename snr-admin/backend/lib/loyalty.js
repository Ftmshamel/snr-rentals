// Member tiers (Bronze → Platinum) and what each one gets.
//
// A renter becomes a member by signing in with Google on the public site
// (optional — guests can still book). Their tier comes from how many of
// THEIR rentals were completed: bookings made while signed in, plus past
// bookings they linked with the reference code.
//
// The perks a booking gets are decided by the server when it is submitted and
// frozen on the booking as `MEMBER` — a later tier change never reprices an
// old rental. RENTAL_FEE is stored net of the perks, so Analytics (which sums
// RENTAL_FEE) shows what was actually charged.
//
// Mirrored in the admin (frontend/src/utils/loyalty.js) and the public site
// (snr-client/src/utils/loyalty.js) — keep `memberPerks` identical in all three.

const { findCamera, getPricingForDate, sameName } = require("./catalog");

const TIER_KEYS = ["bronze", "silver", "gold", "platinum"];

const DEFAULT_TIERS = [
  {
    key: "bronze",
    name: "Bronze",
    minRentals: 0,
    discountPercent: 0,
    freeAddons: 0,
    priority: false,
    perks: ["Your details saved — book in fewer steps", "All your bookings and tracking in one place"],
  },
  {
    key: "silver",
    name: "Silver",
    minRentals: 3,
    discountPercent: 5,
    freeAddons: 0,
    priority: false,
    perks: [],
  },
  {
    key: "gold",
    name: "Gold",
    minRentals: 6,
    discountPercent: 10,
    freeAddons: 1,
    priority: false,
    perks: [],
  },
  {
    key: "platinum",
    name: "Platinum",
    minRentals: 10,
    discountPercent: 15,
    freeAddons: 1,
    priority: true,
    perks: [],
  },
];

class LoyaltyError extends Error {}

function wholeNumber(value, label, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new LoyaltyError(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

/** Owner input → the four tiers, validated. Tier keys and order are fixed. */
function sanitizeTiers(input) {
  if (!Array.isArray(input) || input.length !== TIER_KEYS.length) {
    throw new LoyaltyError("Send all four tiers.");
  }
  const tiers = TIER_KEYS.map((key, i) => {
    const t = input.find((x) => x?.key === key);
    if (!t) throw new LoyaltyError(`Missing the ${key} tier.`);
    const name = String(t.name || "").trim().slice(0, 30) || DEFAULT_TIERS[i].name;
    return {
      key,
      name,
      minRentals: i === 0 ? 0 : wholeNumber(t.minRentals, `${name}: rentals needed`, 1, 500),
      discountPercent: wholeNumber(t.discountPercent, `${name}: discount`, 0, 50),
      freeAddons: wholeNumber(t.freeAddons, `${name}: free add-ons`, 0, 5),
      priority: Boolean(t.priority),
      perks: (Array.isArray(t.perks) ? t.perks : [])
        .map((p) => String(p || "").trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 6),
    };
  });
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].minRentals <= tiers[i - 1].minRentals) {
      throw new LoyaltyError(`${tiers[i].name} must need more rentals than ${tiers[i - 1].name}.`);
    }
  }
  return tiers;
}

/** A rental that counts toward the renter's tier: it actually happened. */
function countsAsCompleted(b) {
  const status = String(b.status || "").toLowerCase();
  if (status === "cancelled" || status === "rejected") return false;
  return status === "completed" || b.FULFILLMENT_STATUS === "returned";
}

/** Where `completed` rentals put a renter, and how far the next tier is. */
function tierFor(tiers, completed) {
  let index = 0;
  tiers.forEach((t, i) => {
    if (completed >= t.minRentals) index = i;
  });
  const next = tiers[index + 1] || null;
  return {
    tier: tiers[index],
    next,
    toNext: next ? next.minRentals - completed : 0,
  };
}

/** The perks frozen on a booking. */
function memberSnapshot(renter, tier, completed) {
  return {
    uid: renter.uid,
    email: renter.email || "",
    tier: tier.key,
    tierName: tier.name,
    discountPercent: tier.discountPercent,
    freeAddons: tier.freeAddons,
    priority: tier.priority,
    completedBefore: completed,
  };
}

/**
 * What a member saves on one rental.
 *   cameraFee   camera rate × days
 *   addons      [{ name, amount }] — each selected add-on's price for the rental
 * The discount is on the camera fee; the free add-ons are the most expensive
 * ones picked (best for the renter).
 */
function memberPerks(member, cameraFee, addons) {
  if (!member) return { discount: 0, freeAddons: [], freeAmount: 0, savings: 0 };
  const discount = Math.round((Math.max(cameraFee || 0, 0) * (member.discountPercent || 0)) / 100);
  const freeAddons = [...(addons || [])]
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, member.freeAddons || 0);
  const freeAmount = freeAddons.reduce((s, a) => s + a.amount, 0);
  return { discount, freeAddons, freeAmount, savings: discount + freeAmount };
}

/** memberPerks for a booking, priced from the catalogue on its pick-up date. */
function perksForBooking(member, catalog, booking, addonNames) {
  const camera = findCamera(catalog, booking.PREFERRED_CAMERA);
  if (!member || !camera) return memberPerks(null);
  const start = new Date(booking.PICK_UP_DATE);
  const end = new Date(booking.RETURN_DATE);
  if (isNaN(start) || isNaN(end)) return memberPerks(null);
  const days = Math.max(Math.round((end - start) / 86400000), 1);
  const rate = (getPricingForDate(camera, booking.PICK_UP_DATE) || []).find(
    (t) => days >= t.minDays && (t.maxDays === null || days <= t.maxDays),
  );
  if (!rate) return memberPerks(null);
  const addons = (addonNames || [])
    .map((name) => {
      const a = (camera.addOns || []).find((x) => sameName(x.name, name));
      return a ? { name: a.name, amount: a.pricePerDay * days } : null;
    })
    .filter(Boolean);
  return memberPerks(member, rate.pricePerDay * days, addons);
}

module.exports = {
  TIER_KEYS,
  DEFAULT_TIERS,
  LoyaltyError,
  sanitizeTiers,
  countsAsCompleted,
  tierFor,
  memberSnapshot,
  memberPerks,
  perksForBooking,
};
