import { useId } from "react";

export default function Logo({ size = "md", withTagline = true }) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const filterId = `logo-filter-${reactId}`;

  return (
    <span
      className={`logo logo--${size} ${withTagline ? "" : "logo--compact"}`}
      aria-label="S&R Rentals"
    >
      <svg
        className="logo__image"
        viewBox="0 0 4906 3226"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feComponentTransfer in="SourceGraphic" result="ink-alpha">
              <feFuncR type="linear" slope="-3" intercept="1.8" />
              <feFuncG type="linear" slope="-3" intercept="1.8" />
              <feFuncB type="linear" slope="-3" intercept="1.8" />
            </feComponentTransfer>
            <feColorMatrix
              in="ink-alpha"
              type="luminanceToAlpha"
              result="alpha"
            />
            <feFlood floodColor="#050505" result="black" />
            <feComposite in="black" in2="alpha" operator="in" />
          </filter>
        </defs>
        <image
          href="/logo.png"
          width="4906"
          height="3226"
          preserveAspectRatio="xMidYMid meet"
          filter={`url(#${filterId})`}
        />
      </svg>
    </span>
  );
}
