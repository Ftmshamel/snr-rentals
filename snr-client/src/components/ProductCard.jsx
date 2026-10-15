import { getCameraAssets } from "../data/assets.js";

const peso = (n) => `₱${n.toLocaleString()}`;

export default function ProductCard({ camera, onPreview }) {
  const assets = getCameraAssets(camera);
  const lowest = Math.min(...camera.pricing.map((t) => t.pricePerDay));

  return (
    <article className="product-card">
      <button
        type="button"
        className="product-card__art"
        onClick={() => onPreview(camera)}
        aria-label={`View ${camera.name} details`}
      >
        {assets.image && (
          <img src={assets.image} alt={camera.name} className="product-card__image" loading="lazy" />
        )}
      </button>

      <div className="product-card__body">
        {camera.tag && <span className="product-card__tag">{camera.tag}</span>}
        <h3 className="product-card__name">{camera.name}</h3>
        <p className="product-card__from">
          From <strong>{peso(lowest)}</strong> / day
        </p>

        <dl className="product-card__pricing">
          {camera.pricing.map((tier) => (
            <div className="product-card__tier" key={tier.label}>
              <dt>{tier.label}</dt>
              <dd>{peso(tier.pricePerDay)}</dd>
            </div>
          ))}
        </dl>

        <div className="product-card__actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={() => onPreview(camera)}>
            Details
          </button>
          <a href={`/book?camera=${encodeURIComponent(camera.name)}`} className="btn btn--solid btn--sm">
            Book
          </a>
        </div>
      </div>
    </article>
  );
}
