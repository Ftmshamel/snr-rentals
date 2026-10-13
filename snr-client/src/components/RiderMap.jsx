import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Where the Lalamove rider is on their trip, for the renter's Track page:
// the two stops of the leg and the rider's last known position.

const icon = (emoji, extra = "") =>
  L.divIcon({
    className: "bk-mapicon",
    html: `<span class="bk-mapicon__dot ${extra}">${emoji}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

export default function RiderMap({ route, location, kind }) {
  const holder = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    if (!holder.current || map.current) return undefined;
    const m = L.map(holder.current, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !route) return;
    layer.current.clearLayers();
    const shopEnd = kind === "return" ? route.to : route.from;
    const renterEnd = kind === "return" ? route.from : route.to;
    const pts = [];
    L.marker([shopEnd.lat, shopEnd.lng], { icon: icon("🏠") }).bindTooltip("S&R Rentals").addTo(layer.current);
    L.marker([renterEnd.lat, renterEnd.lng], { icon: icon("📍") })
      .bindTooltip(kind === "return" ? "Pick-up" : "Drop-off")
      .addTo(layer.current);
    pts.push([shopEnd.lat, shopEnd.lng], [renterEnd.lat, renterEnd.lng]);
    L.polyline(
      [
        [route.from.lat, route.from.lng],
        [route.to.lat, route.to.lng],
      ],
      { color: "#141414", weight: 2, dashArray: "6 6", opacity: 0.5 },
    ).addTo(layer.current);
    if (location) {
      L.marker([location.lat, location.lng], { icon: icon("🛵", "is-rider"), zIndexOffset: 1000 })
        .bindTooltip("Rider")
        .addTo(layer.current);
      pts.push([location.lat, location.lng]);
    }
    m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 });
  }, [route, location, kind]);

  return <div ref={holder} className="bk-ridermap" />;
}
