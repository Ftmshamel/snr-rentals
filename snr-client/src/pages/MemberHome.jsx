import MemberShell from "../components/MemberShell.jsx";
import RentalSpotlight, { greeting, peso, spotlightBooking } from "../components/RentalSpotlight.jsx";
import { useCatalog } from "../data/catalog.js";
import { getCameraAssets } from "../data/assets.js";
import { CONTACT } from "../data/content.js";
import { TIER_ICONS, memberPerks } from "../utils/loyalty.js";

// "/" for a signed-in renter: their own home instead of the marketing page —
// greeting and tier, the rental that's happening now, and the cameras with
// their member price.

function lowestRate(camera) {
  return Math.min(...camera.pricing.map((t) => t.pricePerDay));
}

function CameraTile({ camera, tier }) {
  const assets = getCameraAssets(camera);
  const from = lowestRate(camera);
  const memberRate = tier?.discountPercent ? from - memberPerks(tier, from, []).discount : null;
  return (
    <a href={`/book?camera=${encodeURIComponent(camera.name)}`} className="mh-cam">
      <span className="mh-cam__art">{assets.image && <img src={assets.image} alt="" loading="lazy" />}</span>
      <span className="mh-cam__name">{camera.name}</span>
      <span className="mh-cam__price">
        {memberRate != null ? (
          <>
            <s>{peso(from)}</s> <strong>{peso(memberRate)}</strong>
          </>
        ) : (
          <strong>{peso(from)}</strong>
        )}
        <small> / day</small>
      </span>
      {memberRate != null && <span className="mh-cam__perk">{tier.name} price</span>}
      <span className="mh-cam__cta">Book →</span>
    </a>
  );
}

export default function MemberHome({ member }) {
  const { cameras } = useCatalog();
  const me = member.me;
  const name = (me?.renter?.name || member.user?.name || "there").split(" ")[0];
  const tier = me?.tier;
  const spotlight = me ? spotlightBooking(me.bookings) : null;
  const pct = me?.next
    ? Math.min(100, Math.round(((me.completed - me.tier.minRentals) / Math.max(me.next.minRentals - me.tier.minRentals, 1)) * 100))
    : 100;

  return (
    <MemberShell member={member}>
      <div className="dash">
        <section className={`mh-hero tier--${tier?.key || "bronze"}`}>
          <div className="mh-hero__text">
            <p className="mh-hero__hello">{greeting()},</p>
            <h1 className="mh-hero__name">{name}!</h1>
            {tier ? (
              <p className="mh-hero__tier">
                {TIER_ICONS[tier.key]} {tier.name} member
                {tier.discountPercent ? ` · ${tier.discountPercent}% off every rental` : ""}
                {tier.freeAddons ? ` · ${tier.freeAddons} free add-on` : ""}
              </p>
            ) : (
              <p className="mh-hero__tier">Loading your rewards…</p>
            )}
            <div className="mh-hero__actions">
              <a href="/book" className="btn btn--solid">
                Book a camera
              </a>
              <a href="/account" className="btn btn--outline">
                My rentals &amp; rewards
              </a>
            </div>
          </div>
          {me && (
            <div className="mh-hero__progress">
              <span className="mh-hero__label">{me.next ? `Road to ${me.next.name}` : "Top tier reached"}</span>
              <div className="mh-hero__bar">
                <span style={{ width: `${pct}%` }} />
              </div>
              <span className="mh-hero__count">
                <strong>{me.completed}</strong> completed
                {me.next ? ` · ${me.toNext} more to ${TIER_ICONS[me.next.key]} ${me.next.name}` : ""}
              </span>
            </div>
          )}
        </section>

        <div className="mh-grid">
          <RentalSpotlight booking={spotlight} />
          <section className="dash-panel mh-help">
            <span className="dash-panel__kicker">Quick actions</span>
            <a href="/track" className="mh-action">
              <span>⌖</span> Track a booking
            </a>
            <a href="/account" className="mh-action">
              <span>▤</span> All my bookings
            </a>
            <a href={CONTACT.facebookUrl} target="_blank" rel="noreferrer" className="mh-action">
              <span>✉</span> Message us on Facebook
            </a>
            <a href={CONTACT.phoneHref} className="mh-action">
              <span>☎</span> Call {CONTACT.phone}
            </a>
          </section>
        </div>

        <section className="mh-cams">
          <div className="dash-panel__head">
            <h2 className="dash-panel__title">Rent a camera</h2>
            {tier?.discountPercent > 0 && <span className="mh-cams__note">Prices shown with your {tier.name} discount</span>}
          </div>
          <div className="mh-cams__grid">
            {cameras.map((c) => (
              <CameraTile key={c.id || c.name} camera={c} tier={tier} />
            ))}
          </div>
        </section>
      </div>
    </MemberShell>
  );
}
