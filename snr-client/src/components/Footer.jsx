import { BUSINESS, CONTACT } from "../data/content.js";
import Logo from "./Logo.jsx";

// `compact`: the slim legal footer under the booking, track and member pages.
export default function Footer({ compact = false }) {
  const legal = (
    <p className="footer__legal">
      {BUSINESS.name} · DTI Business Name Reg. No. {BUSINESS.dtiNumber} · <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
      <span aria-hidden="true"> · </span>
      <a href="/privacy">Privacy Policy</a>
    </p>
  );
  if (compact) {
    return (
      <footer className="footer footer--compact">
        <div className="footer__inner">
          {legal}
          <p className="footer__copy">© {new Date().getFullYear()} {BUSINESS.name}</p>
        </div>
      </footer>
    );
  }
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <Logo size="sm" />
        </div>
        <p className="footer__areas">
          {CONTACT.areas} · <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
        </p>
        <p className="footer__socials">
          <a href={CONTACT.facebookUrl} target="_blank" rel="noreferrer">
            {CONTACT.facebookName}
          </a>
          <span aria-hidden="true"> · </span>
          <a href={CONTACT.instagramUrl} target="_blank" rel="noreferrer">
            {CONTACT.instagramHandle}
          </a>
          <span aria-hidden="true"> · </span>
          <a href={CONTACT.tiktokUrl} target="_blank" rel="noreferrer">
            {CONTACT.tiktokHandle}
          </a>
        </p>
        {legal}
        <p className="footer__copy">
          © {new Date().getFullYear()} {BUSINESS.name} — Capture every moment.
        </p>
      </div>
    </footer>
  );
}
