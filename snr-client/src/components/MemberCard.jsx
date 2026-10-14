
// A signed-in renter's tier, like a membership card: who they are, their
// tier, completed rentals and how far the next tier is.
export default function MemberCard({ me, user }) {
  const { tier, next, toNext, completed } = me;
  const start = tier.minRentals;
  const end = next ? next.minRentals : start;
  const pct = next ? Math.min(100, Math.round(((completed - start) / Math.max(end - start, 1)) * 100)) : 100;
  const name = me.renter?.name || user?.name || "Member";
  const photo = me.renter?.picture || user?.photo;
  return (
    <div className={`member-card member-card--${tier.key}`}>
      <div className="member-card__top">
        <span className="member-card__brand">S&amp;R Rentals · Member</span>
        <span className="member-card__tier">
          {tier.name}
        </span>
      </div>
      <div className="member-card__who">
        {photo ? (
          <img src={photo} alt="" className="member-card__avatar" referrerPolicy="no-referrer" />
        ) : (
          <span className="member-card__avatar member-card__avatar--initial">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div>
          <div className="member-card__name">{name}</div>
          <div className="member-card__count">
            {completed} completed rental{completed === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div className="member-card__progress" aria-label={next ? `${toNext} more to ${next.name}` : "Top tier"}>
        <div className="member-card__bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="member-card__next">
          {next ? (
            <>
              <strong>{toNext}</strong> more completed rental{toNext === 1 ? "" : "s"} to{" "}
              <strong>
                {next.name}
              </strong>
            </>
          ) : (
            "You're at the top tier. Thank you for renting with us."
          )}
        </p>
      </div>
    </div>
  );
}
