// Add-on inventory. Edit `units` to match how many you physically own.
//
// These feed the same availability + overbooking logic as cameras
// (utils/availability.js), so a wrong count here shows up as a false
// "Overbooked" warning on /addons.
//
// No add-on has needed stock history yet, so none carries `unitHistory`. If
// you buy or sell one, add it the same way cameras do rather than just
// changing the number — otherwise availability on dates before the change is
// computed against today's stock and past bookings look overbooked:
//
//   { name: "256GB SD Card", units: 2, unitHistory: [{ before: "2026-09-01", units: 1 }] }
//
// unitsOn() in utils/availability.js reads it; nothing else needs changing.
export const ADDONS = [
  { name: "Double Crab Clamp", units: 2 },
  { name: "Long Invisible Stick (3 meters)", units: 1 },
  { name: "Bullet Time Tripod", units: 1 },
  { name: "Quadpod Stand", units: 2 },
  { name: "256GB SD Card", units: 1 },
  { name: "512GB SD Card", units: 2 },
  { name: "Magnetic Mount", units: 1 },
  { name: "Dive Case", units: 2 },
  { name: "Magnetic Neck Mount", units: 1 },
  { name: "Extra G7X Battery", units: 1 },
  { name: "Extra X-T100 Battery", units: 1 },
  { name: "Extra R50 Battery", units: 1 },
  { name: "Camera Tripod", units: 1 },
  { name: "Mini Tripod", units: 1 },
  { name: "128GB SD Card", units: 1 },
  { name: "25mm f1.8 Prime Lens", units: 1 },
  { name: "85mm f1.8 Prime Lens", units: 1 },
];
