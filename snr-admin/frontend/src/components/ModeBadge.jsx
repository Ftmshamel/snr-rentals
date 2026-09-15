export default function ModeBadge({ mode }) {
  const label = (mode || "MEET UP").toUpperCase();
  return (
    <span className="ui-chip ui-chip--solid">{label}</span>
  );
}
