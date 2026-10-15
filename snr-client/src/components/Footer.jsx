import { BUSINESS, CONTACT } from "../data/content.js";
import Icon from "./Icon.jsx";

// DTI registration badge (RA 11967 asks for the business name registration
// number on every page). Only the DTI mark is shown — not government
// campaign branding — since it states a registration, not an endorsement.
function DtiBadge({ small = false }) {
  return (
    <div className={`footer__dti ${small ? "footer__dti--sm" : ""}`}>
      <img src="/dti-logo.png" alt="DTI Philippines" className="footer__dti-logo" />
      <div>
        <div className="footer__dti-title">DTI Registered Business</div>
        <div className="footer__dti-no">Business Name Reg. No. {BUSINESS.dtiNumber}</div>
      </div>
    </div>
  );
}

// Plain links (not the header's #anchors) so they also work from /book,
// /track and the member pages.
const EXPLORE = [
  { label: "Cameras", href: "/#cameras" },
  { label: "Sample Shots", href: "/#gallery" },
  { label: "How to Rent", href: "/#how-to-rent" },
  { label: "S&R Rewards", href: "/#rewards" },
  { label: "FAQs", href: "/#faqs" },
];
const RENTERS = [
  { label: "Book a camera", href: "/book" },
  { label: "Track your booking", href: "/track" },
  { label: "Terms & Conditions", href: "/#terms" },
  { label: "Privacy Policy", href: "/privacy" },
];

// `compact`: the slim legal footer under the booking, track and member pages.
export default function Footer({ compact = false }) {
  const year = new Date().getFullYear();

  if (compact) {
    return (
      <footer className="footer footer--compact">
        <div className="footer__inner footer__inner--compact">
          <DtiBadge small />
          <p className="footer__fine">
            © {year} {BUSINESS.name}
            <span aria-hidden="true"> · </span>
            <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
            <span aria-hidden="true"> · </span>
            <a href="/privacy">Privacy Policy</a>
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__grid">
          <div className="footer__about">
            <div className="footer__name">{BUSINESS.name}</div>
            <p className="footer__blurb">
              Camera, drone and phone rentals around Bulacan, Manila and Laguna.
              Book online, then pick up or get it delivered.
            </p>
            <DtiBadge />
          </div>

          <nav className="footer__col" aria-label="Explore">
            <h3 className="footer__heading">Explore</h3>
            <ul>
              {EXPLORE.map((l) => (
                <li key={l.href}><a href={l.href}>{l.label}</a></li>
              ))}
            </ul>
          </nav>

          <nav className="footer__col" aria-label="For renters">
            <h3 className="footer__heading">For renters</h3>
            <ul>
              {RENTERS.map((l) => (
                <li key={l.href}><a href={l.href}>{l.label}</a></li>
              ))}
            </ul>
          </nav>

          <div className="footer__col">
            <h3 className="footer__heading">Contact</h3>
            <ul>
              <li>
                <a href={CONTACT.phoneHref} className="footer__contact">
                  <Icon name="phone" size={15} /> {CONTACT.phone}
                </a>
              </li>
              <li>
                <span className="footer__contact">
                  <Icon name="pin" size={15} /> {CONTACT.areas}
                </span>
              </li>
              <li>
                <a href={CONTACT.facebookUrl} target="_blank" rel="noreferrer">Facebook</a>
                <span aria-hidden="true"> · </span>
                <a href={CONTACT.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>
                <span aria-hidden="true"> · </span>
                <a href={CONTACT.tiktokUrl} target="_blank" rel="noreferrer">TikTok</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <p>© {year} {BUSINESS.name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
