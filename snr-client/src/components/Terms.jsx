import { TERMS } from "../data/content.js";
import useReveal from "../hooks/useReveal.js";

const HIGHLIGHTS = [
  { big: "20%", text: "downpayment — non-refundable but deductible" },
  { big: "₱1,000", text: "refundable security deposit before release" },
  { big: "24-hr", text: "rental cycle from confirmed pickup time" },
  { big: "₱50/hr", text: "late fee — 3+ hours late = 1 full extra day" },
];

export default function Terms() {
  const ref = useReveal();

  return (
    <section id="terms" className="section" ref={ref}>
      <div className="section__head reveal">
        <p className="section__kicker">Read Before Booking ✦</p>
        <h2 className="section__title section__title--md">
          Terms &amp; Conditions
        </h2>
      </div>

      <div className="term-highlights">
        {HIGHLIGHTS.map((h, i) => (
          <div
            className="term-highlight reveal"
            key={h.big}
            style={{ "--d": `${i * 90}ms` }}
          >
            <span className="term-highlight__big">{h.big}</span>
            <span className="term-highlight__text">{h.text}</span>
          </div>
        ))}
      </div>

      <div className="terms-grid">
        {TERMS.map((group, i) => (
          <div
            className="terms-card reveal"
            key={group.title}
            style={{ "--d": `${(i % 2) * 110}ms` }}
          >
            <h3 className="terms-card__title">{group.title}</h3>
            <ul className="terms-card__list">
              {group.items.map((item) => {
                const splitAt = item.indexOf(": ");
                const label = splitAt > -1 ? item.slice(0, splitAt) : "";
                const rest = splitAt > -1 ? item.slice(splitAt + 2) : item;
                return (
                  <li key={item}>
                    {label && <strong>{label}: </strong>}
                    {rest}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
