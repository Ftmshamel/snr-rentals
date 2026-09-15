import { useRef } from "react";
import Logo from "./Logo.jsx";
import { CAMERA_ASSETS } from "../data/assets.js";

const FLOATERS = [
  { id: "dji-osmo-pocket-3", className: "hero__cam hero__cam--1", depth: 18 },
  { id: "canon-g7x-mark-iii", className: "hero__cam hero__cam--2", depth: 30 },
  { id: "insta360-ace-pro-2", className: "hero__cam hero__cam--3", depth: 12 },
  { id: "dji-osmo-360", className: "hero__cam hero__cam--4", depth: 22 },
  { id: "dji-osmo-nano", className: "hero__cam hero__cam--5", depth: 10 },
  { id: "fujifilm-x-t100", className: "hero__cam hero__cam--6", depth: 26 },
];

export default function Hero() {
  const stageRef = useRef(null);

  // Mouse parallax: shift floating cameras slightly against pointer movement
  const onMove = (e) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    stage.style.setProperty("--mx", x.toFixed(3));
    stage.style.setProperty("--my", y.toFixed(3));
  };

  return (
    <section id="home" className="hero" ref={stageRef} onMouseMove={onMove}>
      <div className="hero__inner">
        <div className="hero__badge float-in" style={{ "--d": "0ms" }}>
          <Logo size="lg" />
        </div>

        <h1 className="hero__title">
          <span className="hero__word" style={{ "--d": "150ms" }}>
            Camera
          </span>{" "}
          <span className="hero__word" style={{ "--d": "280ms" }}>
            for
          </span>{" "}
          <span className="hero__word" style={{ "--d": "410ms" }}>
            Rent
          </span>
        </h1>

        <p className="hero__subtitle float-in" style={{ "--d": "560ms" }}>
          Capture every moment with <strong>S&amp;R Rentals</strong> — action
          cams, vlog cams, and mirrorless kits around Bulacan, Manila &amp;
          Laguna.
        </p>

        <div className="hero__actions float-in" style={{ "--d": "700ms" }}>
          <a href="#cameras" className="btn btn--solid btn--lg">
            View Cameras
          </a>
          <a href="/book" className="btn btn--outline btn--lg">
            Book Now
          </a>
        </div>
      </div>

      {FLOATERS.map((f) => (
        <div
          key={f.id}
          className={f.className}
          style={{ "--depth": f.depth }}
          aria-hidden="true"
        >
          <img src={CAMERA_ASSETS[f.id].image} alt="" />
        </div>
      ))}

      <span className="sparkle sparkle--1" aria-hidden="true">✦</span>
      <span className="sparkle sparkle--2" aria-hidden="true">★</span>
      <span className="sparkle sparkle--3" aria-hidden="true">✦</span>
      <span className="sparkle sparkle--4" aria-hidden="true">✦</span>

      <a href="#cameras" className="hero__scroll-hint" aria-label="Scroll to cameras">
        <span />
      </a>
    </section>
  );
}
