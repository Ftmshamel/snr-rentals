import { useState } from "react";
import { itemImageSrc } from "../data/itemImages.js";

// Shown until the real PNG lands in /public/items/ — a neutral photo
// glyph in the site's monochrome palette.
const PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
      `<rect width="96" height="96" rx="14" fill="#eeeeea"/>` +
      `<rect x="7" y="7" width="82" height="82" rx="10" fill="none" stroke="#3a3a3a" stroke-width="2.5" stroke-dasharray="6 5" opacity="0.5"/>` +
      `<circle cx="35" cy="36" r="7" fill="none" stroke="#3a3a3a" stroke-width="3" opacity="0.55"/>` +
      `<path d="M20 70 L40 50 L52 61 L63 47 L76 70 Z" fill="none" stroke="#3a3a3a" stroke-width="3" stroke-linejoin="round" opacity="0.55"/>` +
      `</svg>`,
  );

// Reusable image with placeholder fallback — also used by the add-on
// picker on the booking page so both places stay visually consistent.
export function GearImage({ name, cameraName, className = "gear-card__img" }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      className={className}
      src={failed ? PLACEHOLDER : itemImageSrc(name, cameraName)}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// Grid of inclusion / add-on cards. items: [{ name, pricePerDay? }]
// cameraName disambiguates add-ons that share a name across cameras but
// need separate artwork (see itemImages.js PER_CAMERA_OVERRIDES).
export default function GearGrid({ items, cameraName }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="gear-grid">
      {items.map((item) => (
        <figure className="gear-card" key={item.name}>
          <GearImage name={item.name} cameraName={cameraName} />
          <figcaption className="gear-card__name">{item.name}</figcaption>
          {item.pricePerDay != null && (
            <span className="gear-card__price">₱{item.pricePerDay}/day</span>
          )}
        </figure>
      ))}
    </div>
  );
}
