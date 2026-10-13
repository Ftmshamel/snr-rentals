import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Map pin for the Lalamove delivery form. The renter searches for their
// place, taps the map, or uses their phone's location, then drags the pin to
// the exact door — S&R copies these coordinates into the Lalamove booking so
// the rider goes to the right spot (a wrong pin was the most common cause of
// late deliveries).
//
// OpenStreetMap tiles + Nominatim search: free, no API key. Nominatim asks
// for at most one request per second, so search runs on submit, not per key.

const DEFAULT_CENTER = [14.72, 120.98]; // between Bulacan and Metro Manila
const pinIcon = L.divIcon({
  className: "bk-pin",
  html: '<span class="bk-pin__dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

export function mapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function LocationPicker({ lat, lng, onChange, invalid = false }) {
  const holder = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  // Leaflet handlers are attached once; read the latest callback through a
  // ref so a drag never writes back with stale form values.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);

  // Create the map once.
  useEffect(() => {
    if (!holder.current || map.current) return undefined;
    const m = L.map(holder.current, { scrollWheelZoom: false }).setView(
      hasPin ? [lat, lng] : DEFAULT_CENTER,
      hasPin ? 17 : 10,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    m.on("click", (e) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in step with the value.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!hasPin) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(m);
      marker.current.on("dragend", () => {
        const p = marker.current.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
    } else {
      marker.current.setLatLng([lat, lng]);
    }
  }, [hasPin, lat, lng]);

  async function search(event) {
    event?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setStatus("Searching…");
    setResults([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ph&limit=5&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setStatus(Array.isArray(data) && data.length ? "" : "No match — try a nearby landmark, or tap the map.");
    } catch {
      setStatus("Search is unavailable right now — tap the map to drop your pin instead.");
    }
  }

  function pick(result) {
    const next = { lat: Number(result.lat), lng: Number(result.lon) };
    onChange(next);
    map.current?.setView([next.lat, next.lng], 17);
    setResults([]);
    setStatus("Now drag the pin to your exact door or gate.");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus("Your browser can't share its location — search or tap the map instead.");
      return;
    }
    setStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange(next);
        map.current?.setView([next.lat, next.lng], 17);
        setStatus("Pinned to your current location — adjust it if needed.");
      },
      () => setStatus("Couldn't get your location — search or tap the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className={`bk-map ${invalid ? "is-invalid" : ""}`}>
      <div className="bk-map__bar">
        <input
          className="bk-input bk-map__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(e)}
          placeholder="Search your barangay, street or landmark"
          aria-label="Search location"
        />
        <button type="button" className="bk-map__btn" onClick={search}>
          Search
        </button>
        <button type="button" className="bk-map__btn bk-map__btn--ghost" onClick={useMyLocation}>
          📍 Use my location
        </button>
      </div>
      {results.length > 0 && (
        <ul className="bk-map__results">
          {results.map((r) => (
            <li key={r.place_id}>
              <button type="button" onClick={() => pick(r)}>
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={holder} className="bk-map__canvas" />
      <div className="bk-map__foot">
        {status ? (
          <span>{status}</span>
        ) : hasPin ? (
          <span>
            ✓ Pin set ({lat.toFixed(5)}, {lng.toFixed(5)}) ·{" "}
            <a href={mapsLink(lat, lng)} target="_blank" rel="noreferrer">
              check it in Google Maps
            </a>
          </span>
        ) : (
          <span>Tap the map where the rider should go.</span>
        )}
      </div>
    </div>
  );
}
