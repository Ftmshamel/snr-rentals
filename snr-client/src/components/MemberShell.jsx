import Logo from "./Logo.jsx";
import { looksSignedIn, signOut } from "../hooks/useMember.js";
import { TIER_ICONS } from "../utils/loyalty.js";

// The signed-in side of the site: an app-style top bar (and a bottom tab bar
// on phones) shared by the member Home and the dashboard, so being signed in
// looks and feels different from the marketing landing page.

const TABS = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/book", label: "Book", icon: "＋" },
  { href: "/account", label: "My rentals", icon: "▤" },
  { href: "/track", label: "Track", icon: "⌖" },
];

function isActive(href) {
  const path = window.location.pathname;
  return href === "/" ? path === "/" : path.startsWith(href);
}

export default function MemberShell({ member, children }) {
  const signedIn = member ? looksSignedIn(member) : false;
  const tier = member?.me?.tier;
  return (
    <main className={`dash-page ${signedIn ? "has-tabbar" : ""}`}>
      <header className="dash-top">
        <a href="/" className="dash-top__brand" aria-label="S&R Rentals home">
          <Logo size="sm" withTagline={false} />
        </a>
        <nav className="dash-top__nav" aria-label="Member">
          {TABS.filter((t) => t.href !== "/book").map((t) => (
            <a key={t.href} href={t.href} className={`dash-top__tab ${isActive(t.href) ? "is-on" : ""}`}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="dash-top__right">
          <a href="/book" className="btn btn--solid btn--sm dash-top__book">
            Book a camera
          </a>
          {signedIn && (
            <div className="dash-top__me">
              <a
                href="/account"
                className={`dash-top__tier tier--${tier?.key || "bronze"} ${tier ? "" : "is-skeleton"}`}
                title="My rentals & rewards"
              >
                {member.user?.photo ? (
                  <img src={member.user.photo} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="dash-top__initial">{(member.user?.name || "M").slice(0, 1).toUpperCase()}</span>
                )}
                {tier ? `${TIER_ICONS[tier.key]} ${tier.name}` : "Member"}
              </a>
              <button type="button" className="dash-top__out" onClick={() => signOut().then(() => window.location.assign("/"))}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {children}

      {signedIn && (
        <nav className="tabbar" aria-label="Member">
          {TABS.map((t) => (
            <a key={t.href} href={t.href} className={`tabbar__item ${isActive(t.href) ? "is-on" : ""} ${t.href === "/book" ? "tabbar__item--book" : ""}`}>
              <span className="tabbar__icon" aria-hidden="true">
                {t.icon}
              </span>
              {t.label}
            </a>
          ))}
        </nav>
      )}
    </main>
  );
}
