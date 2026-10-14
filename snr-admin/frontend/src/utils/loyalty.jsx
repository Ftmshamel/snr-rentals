// Member tiers on the admin side. The rules live in backend/lib/loyalty.js —
// `memberPerks` here is a copy (keep the three copies identical: backend,
// this file, snr-client/src/utils/loyalty.js). Perks are frozen on each
// booking as `MEMBER` when it is submitted.

export const TIER_COLORS = {
  bronze: "#9a5b2a",
  silver: "#7b828c",
  gold: "#a87b06",
  platinum: "#3e5470",
};

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

/** "10% off camera · 1 free add-on · priority" */
export function perkSummary(t) {
  const parts = [];
  if (t.discountPercent) parts.push(`${t.discountPercent}% off camera`);
  if (t.freeAddons) parts.push(`${t.freeAddons} free add-on${t.freeAddons > 1 ? "s" : ""}`);
  if (t.priority) parts.push("priority");
  return parts.join(" · ") || "member";
}

export function MemberBadge({ member, small = false }) {
  if (!member?.tier) return null;
  return (
    <span
      title={`${member.tierName} member${member.email ? ` · ${member.email}` : ""}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono font-bold uppercase text-white ${
        small ? "text-[9px]" : "text-[10px]"
      }`}
      style={{ background: TIER_COLORS[member.tier] || "#555" }}
    >
      {member.tierName}
      {member.priority && <span>· priority</span>}
    </span>
  );
}
