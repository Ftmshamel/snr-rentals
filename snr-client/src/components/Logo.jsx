// /logo.png is already black ink on a transparent background (1200px,
// ~100 KB). It used to be a 4906px, 8.8 MB scan on grey paper texture that
// an SVG luminance filter cut out at runtime — don't put a filter back on
// it: the filter reads transparent pixels as ink and fills the logo in.
export default function Logo({ size = "md", withTagline = true }) {
  return (
    <span
      className={`logo logo--${size} ${withTagline ? "" : "logo--compact"}`}
      aria-label="S&R Rentals"
    >
      <img className="logo__image" src="/logo.png" alt="" width="1200" height="789" />
    </span>
  );
}
