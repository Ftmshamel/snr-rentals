import Icon from "./Icon.jsx";
import { CAMERA_ASSETS } from "../data/assets.js";

const SHOWCASE = ["dji-osmo-pocket-3", "canon-g7x-mark-iii", "insta360-ace-pro-2", "fujifilm-x-t100"];


export default function Hero() {
  return (
    <section id="home" className="hero">
      <div className="hero__inner">
        <div className="hero__copy">
          <p className="hero__kicker">
            <Icon name="pin" size={15} /> Bulacan · Manila · Laguna
          </p>
          <h1 className="hero__title">Camera rentals, made simple.</h1>
          <p className="hero__subtitle">
            Action cams, vlog cams, mirrorless kits, a drone and flagship phones from{" "}
            <strong>S&amp;R Rentals</strong>.
            Check availability, book online and pick up or get it delivered.
          </p>
          <div className="hero__actions">
            <a href="/book" className="btn btn--solid btn--lg">
              Book a camera <Icon name="arrow-right" size={18} />
            </a>
            <a href="#cameras" className="btn btn--outline btn--lg">
              View cameras
            </a>
          </div>
        </div>

        <div className="hero__showcase" aria-hidden="true">
          {SHOWCASE.map((id) => (
            <div className="hero__tile" key={id}>
              <img src={CAMERA_ASSETS[id].image} alt="" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
