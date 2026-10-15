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
        // Soft, low shadows — the calm theme (Oct 2026) retired the hard offsets.
        card: "0 1px 2px rgba(16, 16, 16, 0.04), 0 4px 14px rgba(16, 16, 16, 0.05)",
        "card-hover": "0 2px 4px rgba(16, 16, 16, 0.05), 0 10px 24px rgba(16, 16, 16, 0.08)",
        panel: "0 1px 2px rgba(16, 16, 16, 0.05)",
        btn: "none",
        "btn-hover": "none",
        sm2: "0 1px 2px rgba(16, 16, 16, 0.05)",
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
