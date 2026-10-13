// Member tiers on the public site. The server decides a renter's tier and
// perks (snr-admin backend/lib/loyalty.js); this only displays them and
// previews the member price. Keep `memberPerks` identical to the backend's.

export const TIER_ICONS = { bronze: "◆", silver: "✦", gold: "★", platinum: "♛" };

export function memberPerks(member, cameraFee, addons) {
  if (!member) return { discount: 0, freeAddons: [], freeAmount: 0, savings: 0 };
  const discount = Math.round((Math.max(cameraFee || 0, 0) * (member.discountPercent || 0)) / 100);
  const freeAddons = [...(addons || [])]
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, member.freeAddons || 0);
  const freeAmount = freeAddons.reduce((s, a) => s + a.amount, 0);
  return { discount, freeAddons, freeAmount, savings: discount + freeAmount };
}

/** Every perk of a tier as short lines, the automatic ones first. */
export function perkLines(tier) {
  const lines = [];
  if (tier.discountPercent) lines.push(`${tier.discountPercent}% off every camera rental`);
  if (tier.freeAddons) lines.push(`${tier.freeAddons} free add-on${tier.freeAddons > 1 ? "s" : ""} per rental`);
  if (tier.priority) lines.push("Priority — your requests are reviewed first");
  return [...lines, ...(tier.perks || [])];
}

export function requirementLabel(tier) {
  return tier.minRentals === 0 ? "Sign in to join" : `${tier.minRentals} completed rentals`;
}
