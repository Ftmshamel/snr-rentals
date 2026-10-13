// The shop: where Lalamove riders collect deliveries and drop off returns.
// The API needs exact coordinates; SHOP_LAT / SHOP_LNG / SHOP_ADDRESS in the
// environment override the values here.
const num = (v) => (v === undefined || v === "" ? null : Number(v));

const SHOP = {
  name: process.env.SHOP_NAME || "S&R Rentals",
  phone: process.env.SHOP_PHONE || "0999 331 9123",
  address:
    process.env.SHOP_ADDRESS ||
    "Camera for Rent - S&R Rentals, Purok 5a M Viudez St, Maasim, San Ildefonso, Bulacan",
  lat: num(process.env.SHOP_LAT) ?? 15.047786,
  lng: num(process.env.SHOP_LNG) ?? 120.940356,
  mapsLink: "https://maps.app.goo.gl/gU42nJRXo7jDv3P5A",
};

function shopReady() {
  return Number.isFinite(SHOP.lat) && Number.isFinite(SHOP.lng) && Boolean(SHOP.address);
}

module.exports = { SHOP, shopReady };
