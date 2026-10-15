import { HOW_TO_RENT } from "../data/content.js";
import useReveal from "../hooks/useReveal.js";
import Icon from "./Icon.jsx";

// Four short steps side by side; the full requirements and notes for each
// sit behind "See details" so the section reads at a glance without losing
// any of the copy.
export default function HowToRent() {
  const ref = useReveal();

  return (
    <section id="how-to-rent" className="section" ref={ref}>
      <div className="section__head reveal">
        <p className="section__kicker">Simple process</p>
        <h2 className="section__title">How to Rent?</h2>
      </div>

      <ol className="steps">
        {HOW_TO_RENT.map((step, i) => (
          <li className="step reveal" key={step.title}>
            <div className="step__top">
              <span className="step__number" aria-hidden="true">
                {i + 1}
              </span>
              {step.icon && <Icon name={step.icon} size={22} className="step__icon" />}
            </div>
            <h3 className="step__title">{step.title}</h3>
            <p className="step__summary">{step.summary}</p>

            <details className="step__details">
              <summary>
                See details
                <Icon name="chevron" size={14} className="step__chevron" />
              </summary>
              <p className="step__description">{step.description}</p>
              {step.bullets && (
                <ul className="step__list">
                  {step.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
              <p className="step__note">{step.note}</p>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
