import { getCameraAssets } from "../data/assets.js";

const peso = (n) => `PHP ${n.toLocaleString()}`;

export default function ProductCard({ camera, index, onPreview }) {
  const assets = getCameraAssets(camera);

  return (
    <article
      className="product-card reveal"
      style={{ "--d": `${(index % 3) * 110}ms` }}
    >
      <div className="product-card__art">
        <img
          src={assets.image}
          alt={camera.name}
          className="product-card__image"
          loading="lazy"
        />
      </div>

      <span className="product-card__tag">{camera.tag}</span>

      <h3 className="product-card__name">{camera.name}</h3>

      <div className="product-card__pricing">
        {camera.pricing.map((tier) => (
          <div className="product-card__tier" key={tier.label}>
            <span className="product-card__price">
              {peso(tier.pricePerDay)} <small>/ day</small>
            </span>
            <span className="product-card__duration">{tier.label}</span>
          </div>
        ))}
      </div>

      <div className="product-card__actions">
        <button
          type="button"
          className="btn btn--outline product-card__mini-btn"
          onClick={() => onPreview(camera)}
        >
          View Details
        </button>
      </div>

      <a
        href={`/book?camera=${encodeURIComponent(camera.name)}`}
        className="btn btn--solid product-card__cta"
      >
        Book Now
      </a>
    </article>
  );
}
