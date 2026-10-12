// image: used on the homepage card and small "View Details" thumbnails.
// detailImage (optional): a bigger poster-style shot (camera + inclusions
// visible) shown in the "View Details" modal. Falls back to `image` when
// not set.
export const CAMERA_ASSETS = {
  "dji-osmo-360": {
    image: "/osmo360.png",
    detailImage: "/osmo360-inclusions.png",
  },
  "dji-osmo-pocket-3": {
    image: "/osmopocket3.png",
    detailImage: "/osmopocket3-inclusions.png",
  },
  "dji-osmo-nano": {
    image: "/osmonano.png",
    detailImage: "/osmonano-inclusions.png",
  },
  "insta360-ace-pro-2": {
    image: "/acepro2.png",
    detailImage: "/acepro2-inclusion.png",
  },
  "canon-g7x-mark-iii": {
    image: "/canong7x.png",
    detailImage: "/canong7x-insclusions.png",
  },
  "fujifilm-x-t100": {
    image: "/fujifilm.png",
    detailImage: "/fujifilm-inclusions.png",
  },
  // Artwork not supplied yet — drop these two PNGs into /public/ and the
  // R50 card and details modal pick them up with no code change.
  "canon-eos-r50": {
    image: "/canonr50.png",
    detailImage: "/canonr50-inclusions.png",
  },
};

export const CAMERA_NAME_TO_ASSET_ID = {
  "DJI Osmo 360": "dji-osmo-360",
  "DJI OSMO POCKET 3": "dji-osmo-pocket-3",
  "DJI Osmo Pocket 3": "dji-osmo-pocket-3",
  "DJI Osmo Nano": "dji-osmo-nano",
  "INSTA360 ACE PRO 2": "insta360-ace-pro-2",
  "INSTA360 Ace Pro 2": "insta360-ace-pro-2",
  "CANON G7X MARK III": "canon-g7x-mark-iii",
  "CANON G7X Mark III": "canon-g7x-mark-iii",
  "FUJIFILM X-T100": "fujifilm-x-t100",
  "CANON EOS R50": "canon-eos-r50",
  "Canon EOS R50": "canon-eos-r50",
};

// Images set on the admin Catalog page win; these bundled files are the
// fallback for the original cameras.
export function getCameraAssets(camera) {
  const id = camera?.id || CAMERA_NAME_TO_ASSET_ID[camera?.name] || "";
  const bundled = CAMERA_ASSETS[id] || {};
  return {
    image: camera?.image || bundled.image,
    detailImage: camera?.detailImage || bundled.detailImage,
  };
}
