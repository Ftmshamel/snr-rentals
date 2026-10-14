import { CONTACT } from "../data/content.js";
import Logo from "./Logo.jsx";

export default function Footer() {
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
        <p className="footer__copy">
          © {new Date().getFullYear()} S&amp;R Rentals — Capture every moment.
        </p>
      </div>
    </footer>
  );
}
