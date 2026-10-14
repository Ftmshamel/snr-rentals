import Logo from "./Logo.jsx";
import { looksSignedIn, signOut } from "../hooks/useMember.js";

// The signed-in side of the site: an app-style top bar (and a bottom tab bar
// on phones) shared by the member Home and the dashboard, so being signed in
// looks and feels different from the marketing landing page.

// Small line icons for the phone tab bar (24×24, drawn with the text colour).
const ICON_PATHS = {
  home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  rentals: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  book: "M12 5v14M5 12h14",
  rewards: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z",
  track: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
};

function TabIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/account", label: "My rentals", icon: "rentals" },
  { href: "/book", label: "Book", icon: "book" },
  { href: "/rewards", label: "Rewards", icon: "rewards" },
  { href: "/track", label: "Track", icon: "track" },
];

function isActive(href) {
  const path = window.location.pathname;
  return href === "/" ? path === "/" : path.startsWith(href);
}

export default function MemberShell({ member, children }) {
  const signedIn = member ? looksSignedIn(member) : false;
  const tier = member?.me?.tier;
  return (
    <div className={`dash-page ${signedIn ? "has-tabbar" : ""}`}>
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
                href="/rewards"
                className={`dash-top__tier tier--${tier?.key || "bronze"} ${member.status === "loading" ? "is-skeleton" : ""}`}
                title="My rewards"
              >
                {member.user?.photo ? (
                  <img src={member.user.photo} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="dash-top__initial">{(member.user?.name || "M").slice(0, 1).toUpperCase()}</span>
                )}
                {tier ? `${tier.name}` : "Member"}
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
              <span className="tabbar__icon">
                <TabIcon name={t.icon} />
              </span>
              {t.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
