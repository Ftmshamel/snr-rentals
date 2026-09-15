// Photos for add-ons live in /public/items/, one PNG per item, named by
// slug — e.g. "128GB SD Card" -> /items/128gb-sd-card.png.
// Missing files fall back to a placeholder (see GearGrid.jsx), so PNGs
// can be dropped in over time with no code changes.
// The full expected filename list is in /public/items/README.md.
export function itemSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Exact-name rename applied before slugging, for items whose display name
// doesn't match the artwork filename already saved in /public/items/.
const NAME_OVERRIDES = {
  "Long Invisible Stick (3 meters)": "Long Invisible Stick",
};

// Add-ons that share the same name across cameras but need separate
// artwork per camera — keyed by "<addon name>::<CAMERA NAME UPPERCASED>".
const PER_CAMERA_OVERRIDES = {
  "Extra Battery::CANON G7X MARK III": "G7X Extra Battery",
  "Extra Battery::FUJIFILM X-T100": "Fujifilm Extra Battery",
  // -> /items/r50-extra-battery.png (not supplied yet; falls back to the
  // placeholder until the PNG is added)
  "Extra Battery::CANON EOS R50": "R50 Extra Battery",
};

export function itemImageSrc(name, cameraName) {
  const cameraKey = cameraName ? `${name}::${cameraName.toUpperCase()}` : "";
  const key = PER_CAMERA_OVERRIDES[cameraKey] || NAME_OVERRIDES[name] || name;
  return `/items/${itemSlug(key)}.png`;
}
