# Add-on Photos

Drop one PNG per **add-on** into this folder using the exact filenames
below. They appear automatically in the "Optional Add-ons" grid in the
"View Details" modals on the home page and booking page — no code changes
needed. Until a file exists, the app shows a placeholder in its spot.

(Inclusions are shown as a plain text list now, not photos, so they don't
need files here.)

Tips:

- Transparent or white background works best (cards have a white image box).
- Square-ish images look cleanest (they render in a 1:1 box, `object-fit: contain`).
- Filenames are the add-on name lowercased, with every run of symbols/spaces
  turned into a single `-` (see `src/data/itemImages.js`).
- A couple of names are remapped to different filenames — see
  `NAME_OVERRIDES` / `PER_CAMERA_OVERRIDES` in `src/data/itemImages.js` if
  you need to add another one (e.g. "Extra Battery" means a different item
  on the G7X vs the Fujifilm, so each camera gets its own photo).
- The camera body photos are separate and already exist at the root of
  `public/` (`osmo360.png`, `osmopocket3.png`, `osmonano.png`, `acepro2.png`,
  `canong7x.png`, `fujifilm.png`) — overwrite those to update them.

## Expected filenames (16)

| File | Add-on |
| --- | --- |
| `128gb-sd-card.png` | 128GB SD Card |
| `256gb-sd-card.png` | 256GB SD Card |
| `25mm-f1-8-prime-lens.png` | 25mm f1.8 Prime Lens |
| `512gb-sd-card.png` | 512GB SD Card |
| `85mm-f1-8-prime-lens.png` | 85mm f1.8 Prime Lens |
| `bullet-time-tripod.png` | Bullet Time Tripod |
| `camera-tripod.png` | Camera Tripod |
| `dive-case.png` | Dive Case |
| `double-crab-clamp.png` | Double Crab Clamp |
| `fujifilm-extra-battery.png` | Extra Battery (FUJIFILM X-T100 only) |
| `g7x-extra-battery.png` | Extra Battery (CANON G7X Mark III only) |
| `long-invisible-stick.png` | Long Invisible Stick (3 meters) |
| `magnetic-mount.png` | Magnetic Mount |
| `magnetic-neck-mount.png` | Magnetic Neck Mount |
| `mini-tripod.png` | Mini Tripod |
| `quadpod-stand.png` | Quadpod Stand |
