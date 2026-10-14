import { TIER_ICONS, perkLines, requirementLabel } from "../utils/loyalty.js";

// The four member tiers side by side, each with what it takes and what it
// gives. `current` (a tier key) marks where a signed-in renter stands.
export default function TierLadder({ tiers, current = null, compact = false }) {
  if (!tiers?.length) return null;
  const currentIndex = tiers.findIndex((t) => t.key === current);
  return (
    <ol className={`tier-ladder ${compact ? "tier-ladder--compact" : ""}`}>
      {tiers.map((t, i) => {
        const reached = currentIndex >= i;
        const here = t.key === current;
        return (
          <li
            key={t.key}
            className={`tier-card tier-card--${t.key} ${here ? "is-current" : ""} ${current && !reached ? "is-locked" : ""}`}
          >
            <div className="tier-card__band">
              <span className="tier-card__icon" aria-hidden="true">
                {TIER_ICONS[t.key]}
              </span>
              <span className="tier-card__name">{t.name}</span>
            </div>
            <div className="tier-card__body">
              {here && <span className="tier-card__here">✓ Your tier</span>}
              <p className="tier-card__req">{requirementLabel(t)}</p>
              <ul className="tier-card__perks">
                {perkLines(t).map((line) => (
                  <li key={line}>{line}</li>
                ))}
                {i > 0 && <li className="tier-card__plus">everything in {tiers[i - 1].name}</li>}
              </ul>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
