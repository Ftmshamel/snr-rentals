import { useEffect, useState } from "react";
import { NAV_LINKS } from "../data/content.js";
import Logo from "./Logo.jsx";
import AccountButton from "./AccountButton.jsx";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("#home");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scrollspy: highlight the nav link of the section currently in view
  useEffect(() => {
    const sections = NAV_LINKS.map((l) =>
      document.querySelector(l.href),
    ).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(`#${entry.target.id}`);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const close = () => setOpen(false);

  return (
    <header className={`header ${scrolled ? "header--scrolled" : ""}`}>
      <div className="header__inner">
        <a href="#home" className="header__brand" onClick={close}>
          <Logo size="sm" withTagline={false} />
        </a>

        <nav className={`header__nav ${open ? "is-open" : ""}`}>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`header__link ${active === link.href ? "is-active" : ""}`}
              onClick={close}
            >
              {link.label}
            </a>
          ))}
          {/* A page link, not a section anchor — kept out of NAV_LINKS, which
              the scroll-spy above resolves with querySelector. */}
          <a href="/track" className="header__link" onClick={close}>
            Track
          </a>
          <AccountButton onNavigate={close} className="header__account" />
          <a href="/book" className="btn btn--solid header__cta" onClick={close}>
            Book Now
          </a>
        </nav>

        <button
          className={`header__burger ${open ? "is-open" : ""}`}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
