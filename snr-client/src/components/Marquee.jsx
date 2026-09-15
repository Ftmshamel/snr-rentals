const ITEMS = [
  "Capture Every Moment",
  "Bulacan / Manila / Laguna / Cavite",
  "24-Hour Rental Cycle",
  "Self Pick-Up or Delivery",
  "₱1,000 Refundable Deposit",
  "S&R Rentals",
];

export default function Marquee({ reverse = false }) {
  const track = [...ITEMS, ...ITEMS];
  return (
    <div
      className={`marquee ${reverse ? "marquee--reverse" : ""}`}
      aria-hidden="true"
    >
      <div className="marquee__track">
        {track.map((item, i) => (
          <span className="marquee__item" key={i}>
            {item} <span className="marquee__star">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
