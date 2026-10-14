import { useState } from "react";

// Google Analytics (visit statistics) sets cookies, so it loads only after
// the visitor accepts (index.html defines window.snrLoadAnalytics). The
// choice is remembered in this browser; nothing else on the site needs it.
const KEY = "snr-cookie-consent";

function stored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return "declined"; // storage blocked: don't nag, don't track
  }
}

export default function CookieConsent() {
  const [choice, setChoice] = useState(stored);
  if (choice) return null;

  function decide(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* private mode — the choice lasts for this visit */
    }
    if (value === "accepted") window.snrLoadAnalytics?.();
    setChoice(value);
  }

  return (
    <div className="cookie" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <p>
        We use cookies only for Google Analytics, to count visits and improve the site. Booking works either way.{" "}
        <a href="/privacy">Privacy Policy</a>
      </p>
      <div className="cookie__actions">
        <button type="button" className="btn btn--outline" onClick={() => decide("declined")}>
          Decline
        </button>
        <button type="button" className="btn btn--solid" onClick={() => decide("accepted")}>
          Accept
        </button>
      </div>
    </div>
  );
}
