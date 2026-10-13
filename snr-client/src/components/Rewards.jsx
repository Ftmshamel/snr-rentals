import { useState } from "react";
import { useCatalog } from "../data/catalog.js";
import { signIn, useMember } from "../hooks/useMember.js";
import useReveal from "../hooks/useReveal.js";
import TierLadder from "./TierLadder.jsx";
import { GoogleMark } from "./AccountButton.jsx";

// Landing-page section: the member tiers and how to join.
export default function Rewards() {
  const { tiers } = useCatalog();
  // Re-scan once the tiers arrive — the section renders nothing until then.
  const ref = useReveal(tiers?.length || 0);
  const member = useMember();
  const [busy, setBusy] = useState(false);
  if (!tiers?.length) return null;

  return (
    <section id="rewards" className="section" ref={ref}>
      <div className="section__head reveal">
        <p className="section__kicker">Rent More, Save More ✦</p>
        <h2 className="section__title">S&amp;R Rewards</h2>
        <p className="rewards__lead">
          Sign in with Google when you book. Every completed rental moves you up — and your perks apply to the price
          automatically.
        </p>
      </div>
      <div className="reveal" style={{ "--d": "120ms" }}>
        <TierLadder tiers={tiers} current={member.me?.tier?.key || null} />
      </div>
      <div className="rewards__cta reveal" style={{ "--d": "240ms" }}>
        {member.status === "member" ? (
          <a href="/account" className="btn btn--solid">
            View my rewards →
          </a>
        ) : member.status === "off" ? (
          <a href="/book" className="btn btn--solid">
            Book now
          </a>
        ) : (
          <button
            type="button"
            className="btn btn--solid rewards__signin"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signIn();
              } finally {
                setBusy(false);
              }
            }}
          >
            <GoogleMark /> {busy ? "Signing in…" : "Join free with Google"}
          </button>
        )}
        <p className="rewards__note">Optional — you can always book as a guest.</p>
      </div>
    </section>
  );
}
