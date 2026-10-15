import { useCatalog } from "../data/catalog.js";
import { openSignIn, useMember } from "../hooks/useMember.js";
import useReveal from "../hooks/useReveal.js";
import TierLadder from "./TierLadder.jsx";
import Icon from "./Icon.jsx";

// Landing-page section: the member tiers and how to join.
export default function Rewards() {
  const { tiers } = useCatalog();
  // Re-scan once the tiers arrive — the section renders nothing until then.
  const ref = useReveal(tiers?.length || 0);
  const member = useMember();
  if (!tiers?.length) return null;

  return (
    <section id="rewards" className="section" ref={ref}>
      <div className="section__head reveal">
        <p className="section__kicker">Member rewards</p>
        <h2 className="section__title">S&amp;R Rewards</h2>
        <p className="rewards__lead">
          Sign in when you book. Each completed rental moves you up a tier, and your discount comes off the price
          automatically.
        </p>
      </div>
      <div className="reveal" style={{ "--d": "120ms" }}>
        <TierLadder tiers={tiers} current={member.me?.tier?.key || null} />
      </div>
      <div className="rewards__cta reveal" style={{ "--d": "240ms" }}>
        {member.status === "member" ? (
          <a href="/rewards" className="btn btn--solid">
            View my rewards <Icon name="arrow-right" size={16} />
          </a>
        ) : member.status === "off" ? (
          <a href="/book" className="btn btn--solid">
            Book now
          </a>
        ) : (
          <button type="button" className="btn btn--solid rewards__signin" onClick={openSignIn}>
            Sign in or create an account
          </button>
        )}
        <p className="rewards__note">Optional. You can always book as a guest.</p>
      </div>
    </section>
  );
}
