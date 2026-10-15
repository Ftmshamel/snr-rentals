import Icon from "./Icon.jsx";

// A static strip of the rental basics (it used to scroll as a marquee).
const ITEMS = [
  { icon: "pin", text: "Bulacan · Manila · Laguna" },
  { icon: "clock", text: "24-hour rental cycle" },
  { icon: "truck", text: "Self pick-up or delivery" },
  { icon: "shield", text: "₱1,000 refundable deposit" },
];

export default function Marquee() {
  return (
    <div className="infobar">
      <ul className="infobar__list">
        {ITEMS.map((item) => (
          <li key={item.text}>
            <Icon name={item.icon} size={18} /> {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
