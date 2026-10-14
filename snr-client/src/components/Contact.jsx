import { CONTACT } from "../data/content.js";
import useReveal from "../hooks/useReveal.js";

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="contact-card__icon" aria-hidden="true">
      <path
        d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="contact-card__icon" aria-hidden="true">
      <path
        d="M6.6 10.8a15.6 15.6 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.6 1 1 0 0 1-.25 1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="contact-card__icon" aria-hidden="true">
      <path
        d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z"
        fill="currentColor"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="contact-card__icon" aria-hidden="true">
      <path
        d="M12 2.2c3.2 0 3.6 0 4.9.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.9.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 4 4 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2Zm0 4.6a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4Zm0 8.6a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8Zm5.4-8.9a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="contact-card__icon" aria-hidden="true">
      <path
        d="M16.6 3c.4 2.3 1.9 3.8 4.4 4v3.2c-1.6 0-3-.5-4.4-1.4v6.5a5.9 5.9 0 1 1-5.9-5.9c.3 0 .7 0 1 .1v3.3a2.7 2.7 0 1 0 1.9 2.6V3h3Z"
        fill="currentColor"
      />
    </svg>
  );
}

const CARDS = [
  {
    icon: <PinIcon />,
    label: "Service Areas",
    value: CONTACT.areas,
    href: null,
  },
  {
    icon: <PhoneIcon />,
    label: "Call / Text",
    value: CONTACT.phone,
    href: CONTACT.phoneHref,
  },
  {
    icon: <FacebookIcon />,
    label: "Facebook",
    value: CONTACT.facebookName,
    href: CONTACT.facebookUrl,
  },
  {
    icon: <InstagramIcon />,
    label: "Instagram",
    value: CONTACT.instagramHandle,
    href: CONTACT.instagramUrl,
  },
  {
    icon: <TikTokIcon />,
    label: "TikTok",
    value: CONTACT.tiktokHandle,
    href: CONTACT.tiktokUrl,
  },
];

export default function Contact() {
  const ref = useReveal();

  return (
    <section id="contact" className="section" ref={ref}>
      <div className="section__head reveal">
        <p className="section__kicker">Let's talk</p>
        <h2 className="section__title section__title--md">Book Your Camera</h2>
        <p className="section__lede">
          Start a booking request right here on the site, or message us on any
          channel below — we'll check availability and confirm your slot.
        </p>
        <a href="/book" className="btn btn--solid btn--lg contact-cta reveal">
          Start a booking
        </a>
      </div>

      <div className="contact-grid">
        {CARDS.map((card, i) => {
          const inner = (
            <>
              {card.icon}
              <span className="contact-card__label">{card.label}</span>
              <span className="contact-card__value">{card.value}</span>
            </>
          );
          return card.href ? (
            <a
              key={card.label}
              href={card.href}
              target={card.href.startsWith("tel:") ? undefined : "_blank"}
              rel="noreferrer"
              className="contact-card reveal"
              style={{ "--d": `${i * 80}ms` }}
            >
              {inner}
            </a>
          ) : (
            <div
              key={card.label}
              className="contact-card reveal"
              style={{ "--d": `${i * 80}ms` }}
            >
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
