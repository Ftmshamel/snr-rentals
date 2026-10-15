import ModeBadge from "./ModeBadge.jsx";

export default function EventCard({
  time,
  eventTag,
  cameraName,
  renterName,
  address,
  preferredMode,
}) {
  const shortAddr =
    address && address.length > 48
      ? `${address.slice(0, 45)}…`
      : address || "—";

  return (
    <div className="rounded-row border-l-2 border-[color:var(--color-ink)] bg-[rgba(255,255,255,0.55)] py-2 pl-3 pr-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-num text-sm">{time}</span>
        <span className="ui-chip">{eventTag === "RETURN" ? "Return" : "Pickup"}</span>
        <ModeBadge mode={preferredMode} />
      </div>
      <div className="mt-1.5 font-display text-base font-bold text-[color:var(--color-black)]">
        {cameraName}
      </div>
      <div className="text-sm font-semibold text-[color:var(--color-ink)]">
        {renterName}
      </div>
      <div className="text-xs font-medium text-[color:var(--color-dark-gray)]">
        {shortAddr}
      </div>
    </div>
  );
}
