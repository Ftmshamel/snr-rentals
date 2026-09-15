// Monochrome poster-style SVG illustrations for each camera model.
// Drawn with bold strokes and flat grays to match the brand's print look.

const INK = "#141414";
const BODY = "#2b2b2b";
const PANEL = "#4a4a4a";
const SCREEN = "#d9dbd6";
const LIGHT = "#eeeeea";

const common = {
  stroke: INK,
  strokeWidth: 6,
  strokeLinejoin: "round",
  strokeLinecap: "round",
};

function ScreenScene({ x, y, w, h, r = 6 }) {
  // A small "photo" inside a screen: horizon, mountains, sun
  const clipId = `scene-${x}-${y}-${w}`;
  return (
    <g>
      <clipPath id={clipId}>
        <rect x={x} y={y} width={w} height={h} rx={r} />
      </clipPath>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={SCREEN} />
      <g clipPath={`url(#${clipId})`}>
        <circle cx={x + w * 0.72} cy={y + h * 0.32} r={h * 0.16} fill={PANEL} />
        <path
          d={`M ${x} ${y + h * 0.78} L ${x + w * 0.3} ${y + h * 0.42} L ${x + w * 0.52} ${y + h * 0.68} L ${x + w * 0.72} ${y + h * 0.5} L ${x + w} ${y + h * 0.8} L ${x + w} ${y + h} L ${x} ${y + h} Z`}
          fill={BODY}
        />
      </g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={r}
        fill="none"
        stroke={INK}
        strokeWidth="5"
      />
    </g>
  );
}

function Lens({ cx, cy, r }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={BODY} {...common} />
      <circle cx={cx} cy={cy} r={r * 0.62} fill={INK} />
      <circle cx={cx} cy={cy} r={r * 0.34} fill={PANEL} />
      <circle cx={cx + r * 0.22} cy={cy - r * 0.26} r={r * 0.12} fill={LIGHT} />
    </g>
  );
}

function Osmo360() {
  return (
    <g>
      <rect x="55" y="30" width="110" height="150" rx="22" fill={BODY} {...common} />
      <Lens cx="110" cy="72" r="30" />
      <ScreenScene x="72" y="116" w="76" h="42" />
      <rect x="82" y="168" width="14" height="6" rx="3" fill={LIGHT} />
      <rect x="124" y="168" width="14" height="6" rx="3" fill={LIGHT} />
    </g>
  );
}

function OsmoPocket3() {
  return (
    <g>
      {/* handle */}
      <rect x="82" y="108" width="56" height="82" rx="14" fill={BODY} {...common} />
      <circle cx="110" cy="168" r="9" fill={LIGHT} stroke={INK} strokeWidth="5" />
      {/* rotated widescreen */}
      <ScreenScene x="58" y="112" w="104" h="40" r="8" />
      {/* gimbal neck */}
      <rect x="103" y="86" width="14" height="26" rx="6" fill={PANEL} {...common} />
      {/* camera head */}
      <rect x="84" y="38" width="52" height="52" rx="16" fill={BODY} {...common} />
      <Lens cx="110" cy="64" r="17" />
    </g>
  );
}

function OsmoNano() {
  return (
    <g>
      {/* camera cube on top */}
      <rect x="62" y="34" width="96" height="58" rx="16" fill={BODY} {...common} />
      <Lens cx="132" cy="63" r="20" />
      <circle cx="82" cy="52" r="5" fill={LIGHT} />
      {/* screen dock below */}
      <rect x="56" y="98" width="108" height="76" rx="14" fill={BODY} {...common} />
      <ScreenScene x="68" y="110" w="84" h="52" />
      <circle cx="62" cy="150" r="7" fill={PANEL} stroke={INK} strokeWidth="4" />
    </g>
  );
}

function AcePro2() {
  return (
    <g>
      {/* flipped-up screen */}
      <rect x="58" y="30" width="104" height="58" rx="10" fill={BODY} {...common} />
      <ScreenScene x="66" y="38" w="88" h="42" />
      {/* hinge */}
      <rect x="70" y="88" width="80" height="10" rx="5" fill={PANEL} {...common} />
      {/* body */}
      <rect x="52" y="98" width="116" height="80" rx="16" fill={BODY} {...common} />
      <Lens cx="134" cy="138" r="26" />
      <rect x="66" y="112" width="40" height="24" rx="6" fill={SCREEN} stroke={INK} strokeWidth="5" />
      <rect x="66" y="146" width="26" height="10" rx="5" fill={PANEL} />
    </g>
  );
}

function G7X() {
  return (
    <g>
      {/* body */}
      <rect x="34" y="70" width="152" height="86" rx="16" fill={BODY} {...common} />
      {/* top plate */}
      <rect x="48" y="56" width="46" height="16" rx="6" fill={PANEL} {...common} />
      <rect x="140" y="54" width="28" height="18" rx="6" fill={PANEL} {...common} />
      {/* zoom lens */}
      <Lens cx="110" cy="113" r="36" />
      <circle cx="110" cy="113" r="46" fill="none" stroke={INK} strokeWidth="6" />
      {/* grip + details */}
      <rect x="42" y="82" width="14" height="60" rx="7" fill={PANEL} />
      <circle cx="168" cy="88" r="6" fill={LIGHT} />
    </g>
  );
}

function XT100() {
  return (
    <g>
      {/* body */}
      <rect x="30" y="78" width="160" height="84" rx="14" fill={BODY} {...common} />
      {/* viewfinder hump */}
      <path d="M 88 78 L 96 56 L 124 56 L 132 78 Z" fill={BODY} {...common} />
      {/* dials */}
      <circle cx="58" cy="72" r="11" fill={PANEL} {...common} />
      <circle cx="162" cy="72" r="11" fill={PANEL} {...common} />
      {/* lens */}
      <Lens cx="110" cy="120" r="34" />
      <circle cx="110" cy="120" r="43" fill="none" stroke={INK} strokeWidth="6" />
      {/* leatherette + screen hint */}
      <rect x="38" y="96" width="18" height="48" rx="8" fill={PANEL} />
      <rect x="158" y="98" width="24" height="18" rx="4" fill={SCREEN} stroke={INK} strokeWidth="4" />
    </g>
  );
}

const ART = {
  "dji-osmo-360": Osmo360,
  "dji-osmo-pocket-3": OsmoPocket3,
  "dji-osmo-nano": OsmoNano,
  "insta360-ace-pro-2": AcePro2,
  "canon-g7x-mark-iii": G7X,
  "fujifilm-x-t100": XT100,
};

export default function CameraArt({ id, className = "" }) {
  const Art = ART[id] || Osmo360;
  return (
    <svg
      viewBox="0 0 220 220"
      className={`camera-art ${className}`}
      role="img"
      aria-label="Camera illustration"
    >
      <Art />
    </svg>
  );
}
