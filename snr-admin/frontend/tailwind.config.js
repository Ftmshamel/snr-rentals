/** @type {import('tailwindcss').Config} */

// Monochrome poster theme, ported from the client-side site
// (SnR-Rentals-App-Client-Side/src/index.css).
//
// The admin is light-only: the dark-mode toggle was removed when this theme
// landed, so there are no `dark:` variants anywhere in src/.
//
// `gray` and `zinc` are remapped onto the poster's paper/ink ramp rather than
// Tailwind's blue-tinted defaults. That keeps the existing utility classes
// meaningful while shifting the whole app onto the brand palette in one place.
const paper = {
  50: "#fdfdfc", // near-white, input fills
  100: "#f6f6f3",
  200: "#eeeeea", // --color-bg-light
  300: "#e2e4df",
  400: "#d8dad5", // --color-bg, page background
  500: "#b9bcb5",
  600: "#8b8e88",
  700: "#5c5f5a",
  800: "#3a3a3a", // --color-border
  900: "#2f2f2f", // --color-dark-gray
  950: "#141414", // --color-ink
};

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Poppins", "Montserrat", "sans-serif"],
        mono: ['"DM Mono"', "monospace"],
        sans: ["Poppins", "sans-serif"],
        script: ["Caveat", "cursive"],
      },
      colors: {
        gray: paper,
        zinc: paper,
        ink: "#141414",
        paper: "#d8dad5",
      },
      borderRadius: {
        // Poster shapes: generous on panels, tighter on dense data.
        card: "22px",
        panel: "26px",
        row: "12px",
        cell: "10px",
      },
      boxShadow: {
        // Hard offset shadows — no blur — are the signature of the theme.
        card: "10px 12px 0 rgba(0, 0, 0, 0.2)",
        "card-hover": "14px 18px 0 rgba(0, 0, 0, 0.25)",
        panel: "7px 8px 0 rgba(0, 0, 0, 0.18)",
        btn: "5px 6px 0 rgba(0, 0, 0, 0.25)",
        "btn-hover": "9px 11px 0 rgba(0, 0, 0, 0.25)",
        sm2: "4px 5px 0 rgba(0, 0, 0, 0.16)",
      },
      transitionTimingFunction: {
        pop: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "pop-in": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
