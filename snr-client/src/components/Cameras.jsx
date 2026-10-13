import { useState } from "react";
import { useCatalog } from "../data/catalog.js";
import { getCameraAssets } from "../data/assets.js";
import ProductCard from "./ProductCard.jsx";
import GearGrid from "./GearGrid.jsx";
import useReveal from "../hooks/useReveal.js";
import useLockBodyScroll from "../hooks/useLockBodyScroll.js";

function CameraDetails({ camera, onClose }) {
  const assets = getCameraAssets(camera);
  useLockBodyScroll();

  return (
    <div
      className="product-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${camera.name} details`}
      onClick={onClose}
    >
      <div
        className="details-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="details-modal__bar">
          <span>{camera.name} Details</span>
          <button
            type="button"
            className="product-modal__close product-modal__close--icon"
            onClick={onClose}
            aria-label="Close details"
          >
            ✕
          </button>
        </div>

        <div className="details-modal__body">
          <div className="details-modal__summary">
            {(assets.detailImage || assets.image) && (
              <img
                className="details-modal__hero-img"
                src={assets.detailImage || assets.image}
                alt={camera.name}
              />
            )}
            <div className="details-modal__hero-info">
              <span className="details-modal__tag">{camera.tag}</span>
              <h3 className="details-modal__name">{camera.name}</h3>
              <div className="details-modal__pricing">
                {camera.pricing.map((tier) => (
                  <div key={tier.label} className="details-modal__price-row">
                    <span className="details-modal__price">
                      PHP {tier.pricePerDay.toLocaleString()}
                      <small> / day</small>
                    </span>
                  </div>
                ))}
              </div>
              {camera.inclusions.length > 0 && (
                <div className="details-modal__inclusions">
                  <ul className="details-modal__list">
                    {camera.inclusions.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {camera.addOns.length > 0 && (
            <section className="details-modal__section">
              <div className="details-modal__label">Optional Add-ons</div>
              <GearGrid items={camera.addOns} cameraName={camera.name} />
            </section>
          )}

          <a
            href={`/book?camera=${encodeURIComponent(camera.name)}`}
            className="btn btn--solid details-modal__cta"
          >
            Book Now
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Cameras() {
  const [details, setDetails] = useState(null);
  const { cameras, loading, error } = useCatalog();
  const ref = useReveal(cameras.length);

  return (
    <section id="cameras" className="section" ref={ref}>
      {details && (
        <CameraDetails camera={details} onClose={() => setDetails(null)} />
      )}

      <div className="section__head reveal">
        <p className="section__kicker">The Lineup</p>
        <h2 className="section__title">Cameras</h2>
        <p className="section__lede">
          Rented per 24-hour cycle. Longer trips get the lower daily rate -
          add-ons priced per day.
        </p>
      </div>

      {(loading || error || cameras.length === 0) && (
        <p className="section__lede">
          {loading
            ? "Loading cameras…"
            : "Our camera list can't be shown right now — please refresh, or message us to book."}
        </p>
      )}

      <div className="product-grid">
        {cameras.map((camera, i) => (
          <ProductCard
            key={camera.id}
            camera={camera}
            index={i}
            onPreview={setDetails}
          />
        ))}
      </div>
    </section>
  );
}
