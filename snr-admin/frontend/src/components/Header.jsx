import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiGetJson } from "../utils/api.js";

const NAV = [
  { to: "/", label: "Schedule", match: (p) => p === "/" },
  { to: "/cameras", label: "Cameras", match: (p) => p.startsWith("/camera") },
  { to: "/addons", label: "Add-ons", match: (p) => p.startsWith("/addon") },
  { to: "/quotation", label: "Quote", match: (p) => p === "/quotation" },
  { to: "/approvals", label: "Approvals", match: (p) => p === "/approvals", badge: true },
  { to: "/rentals", label: "Rentals", match: (p) => p === "/rentals", ownerOnly: true },
  { to: "/analytics", label: "Analytics", match: (p) => p === "/analytics", ownerOnly: true },
  { to: "/expenses", label: "Expenses", match: (p) => p === "/expenses", ownerOnly: true },
];

export default function Header({
  weekRangeLabel,
  onPrevWeek,
  onNextWeek,
  backTo,
  titleExtra,
}) {
  const location = useLocation();
  const role = localStorage.getItem("auth_role") || "admin";
  const [pendingCount, setPendingCount] = useState(0);
  // Bookings saved to MongoDB whose Supabase mirror failed — they exist and the
  // renter has a confirmation, but nothing else in this admin can see them.
  const [unmirrored, setUnmirrored] = useState([]);

  useEffect(() => {
    apiGetJson("/api/bookings/pending")
      .then((data) => setPendingCount(data.bookings?.length ?? 0))
      .catch(() => {});

    apiGetJson("/api/bookings/by?type=unmirrored")
      .then((data) => setUnmirrored(data.bookings ?? []))
      .catch(() => {});
  }, [location.pathname]);

  const links = NAV.filter((n) => !n.ownerOnly || role === "owner");

  return (
    <header className="sticky top-0 z-40 border-b-4 border-[color:var(--color-ink)] bg-[rgba(238,238,234,0.9)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {backTo ? (
              <Link to={backTo} className="ui-btn ui-btn--sm shrink-0">
                ← Back
              </Link>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <span className="ui-title font-display text-2xl">SnR</span>
              <span className="font-display text-2xl font-extrabold text-[color:var(--color-dark-gray)]">
                Admin
              </span>
              {titleExtra ? (
                <span className="max-w-[40vw] truncate font-display text-base font-bold text-[color:var(--color-dark-gray)] sm:max-w-[50%]">
                  {titleExtra}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
            {weekRangeLabel && onPrevWeek && onNextWeek ? (
              <>
                <button
                  type="button"
                  onClick={onPrevWeek}
                  className="ui-btn ui-btn--icon"
                  aria-label="Previous week"
                >
                  ←
                </button>
                <span className="ui-num text-xs">{weekRangeLabel}</span>
                <button
                  type="button"
                  onClick={onNextWeek}
                  className="ui-btn ui-btn--icon"
                  aria-label="Next week"
                >
                  →
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("auth_token");
                localStorage.removeItem("auth_role");
                window.location.reload();
              }}
              className="ui-btn ui-btn--sm"
              aria-label="Log out"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Setting overflow-x also makes the browser compute overflow-y to
            auto, which would clip .ui-btn's hover lift (-2px) and its grown
            shadow (7px 8px). The padding leaves room for both; the matching
            negative margins keep the nav visually aligned with the header. */}
        <nav className="-mx-2 -mb-1.5 -mt-1 overflow-x-auto px-2 pb-2.5 pt-1">
          <div className="flex w-full min-w-max gap-1.5">
            {links.map((n) => {
              const active = n.match(location.pathname);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  className={`ui-btn ui-btn--sm flex-1 justify-center ${
                    active ? "ui-btn--solid" : ""
                  }`}
                >
                  {n.label}
                  {n.badge && pendingCount > 0 && (
                    <span
                      className={`ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold ${
                        active
                          ? "bg-[color:var(--color-bg-light)] text-[color:var(--color-ink)]"
                          : "bg-[color:var(--color-danger)] text-white"
                      }`}
                    >
                      {pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {unmirrored.length > 0 && (
        <div className="border-t-4 border-[color:var(--color-danger)] bg-[rgba(255,241,240,0.95)] px-4 py-2.5 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="ui-kicker text-rose-800">
              ⚠ {unmirrored.length} booking{unmirrored.length === 1 ? "" : "s"} did not sync
            </div>
            <p className="mt-1 text-xs font-semibold text-[color:var(--color-ink)]">
              {unmirrored.length === 1 ? "This booking is" : "These bookings are"}{" "}
              saved and the renter has a confirmation, but {unmirrored.length === 1 ? "it is" : "they are"}{" "}
              not in the admin database — so {unmirrored.length === 1 ? "it will" : "they will"}{" "}
              not appear in Approvals, the schedule, or availability.
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {unmirrored.slice(0, 4).map((b) => (
                <li key={b.responseId} className="font-mono text-[11px] text-[color:var(--color-ink)]">
                  {b.PICK_UP_DATE || "—"} · {b.PREFERRED_CAMERA || "—"} ·{" "}
                  {b.FACEBOOK_ACCOUNT_NAME || b.FULL_NAME || "—"}
                  {b.CONTACT_NUMBER ? ` · ${b.CONTACT_NUMBER}` : ""}
                </li>
              ))}
              {unmirrored.length > 4 && (
                <li className="font-mono text-[11px] text-[color:var(--color-dark-gray)]">
                  …and {unmirrored.length - 4} more
                </li>
              )}
            </ul>
            <p className="mt-1.5 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
              Recover with: node scripts/restore-unmirrored-bookings.js --commit
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
