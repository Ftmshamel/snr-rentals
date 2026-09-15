import { HOW_TO_RENT } from "../data/content.js";
import useReveal from "../hooks/useReveal.js";

export default function HowToRent() {
  const ref = useReveal();

  return (
    <section id="how-to-rent" className="section" ref={ref}>
      <div className="section__head reveal">
        <p className="section__kicker">Simple Process ✦</p>
        <h2 className="section__title">How to Rent?</h2>
      </div>

      <ol className="steps">
        {HOW_TO_RENT.map((step, i) => (
          <li
            className="step reveal"
            key={step.title}
            style={{ "--d": `${i * 120}ms` }}
          >
            <span className="step__number" aria-hidden="true">
              {i + 1}
            </span>
            <div className="step__body">
              <h3 className="step__title">{step.title}</h3>
              <p className="step__description">{step.description}</p>
              {step.bullets && (
                <ul className="step__list">
                  {step.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
              <p className="step__note">✦ {step.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
