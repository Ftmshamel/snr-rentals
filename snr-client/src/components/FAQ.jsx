import { useState } from "react";
import { FAQS } from "../data/content.js";
import useReveal from "../hooks/useReveal.js";

function FaqItem({ faq, isOpen, onToggle, index }) {
  // The reveal class lives on a wrapper with a static className: useReveal
  // adds .is-visible imperatively, and a React re-render of a dynamic
  // className (is-open toggling) would wipe it and hide the card.
  return (
    <div className="reveal" style={{ "--d": `${(index % 4) * 70}ms` }}>
      <div className={`faq ${isOpen ? "is-open" : ""}`}>
        <button className="faq__question" onClick={onToggle} aria-expanded={isOpen}>
          <span>{faq.q}</span>
          <span className="faq__icon" aria-hidden="true">
            +
          </span>
        </button>
        <div className="faq__answer">
          <p>{faq.a}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ() {
  const ref = useReveal();
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faqs" className="section" ref={ref}>
      <div className="section__head reveal">
        <p className="section__kicker">Good to Know ✦</p>
        <h2 className="section__title section__title--md">FAQs</h2>
      </div>

      <div className="faq-list">
        {FAQS.map((faq, i) => (
          <FaqItem
            key={faq.q}
            faq={faq}
            index={i}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
          />
        ))}
      </div>
    </section>
  );
}
