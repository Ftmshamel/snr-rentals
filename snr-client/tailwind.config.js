/** @type {import('tailwindcss').Config} */
export default {
  // Only the booking page uses Tailwind; the landing page keeps its own CSS.
  content: ["./src/pages/**/*.{js,jsx}"],
  corePlugins: {
    // Preflight would reset the landing page styles; booking.css restores the
    // pieces the booking page needs, scoped under .booking-app.
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        display: ["Montserrat", "sans-serif"],
        mono: ['"DM Mono"', "monospace"],
        sans: ["Poppins", "sans-serif"],
      },
    },
  },
  plugins: [],
};
