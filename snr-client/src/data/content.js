// Site copy (contact, how-to-rent, terms, FAQs). Camera prices live in the
// admin Catalog page — see data/catalog.js.

export const CONTACT = {
  phone: "0912 016 1865",
  phoneHref: "tel:+639120161865",
  areas: "Bulacan / Manila / Laguna",
  facebookName: "Camera for Rent - S&R Rentals",
  // TODO: replace with the real Facebook page URL before publishing
  facebookUrl: "https://www.facebook.com/profile.php?id=61586923391156",
  instagramHandle: "@snr.rentals",
  instagramUrl: "https://www.instagram.com/snr.rentals",
  tiktokHandle: "@snr_rentals",
  tiktokUrl: "https://www.tiktok.com/@snr_rentals",
};

// Shown in the footer of every page (RA 11967 — Internet Transactions Act).
export const BUSINESS = {
  name: "S&R Rentals",
  dtiNumber: "8546908",
};

// Cameras, prices, add-ons and inclusions are no longer here — they come from
// the booking API (Firestore), edited on the admin Catalog page. See
// data/catalog.js.

export const STATS = [
  { value: 7, suffix: "", label: "Camera Models" },
  { value: 15, suffix: "", label: "Units Ready" },
  { value: 3, suffix: "", label: "Service Areas" },
  { value: 24, suffix: "hr", label: "Rental Cycle" },
];

export const HOW_TO_RENT = [
  {
    title: "Check Availability",
    description:
      "Open our booking form on this website and choose your preferred unit, pickup or delivery option, and rental schedule. Availability is checked automatically as you complete the first step:",
    bullets: [
      "Preferred Unit",
      "Preferred Option: Self Pick-Up or Delivery",
      "Pickup / Delivery Date & Time",
      "Return Date & Time",
    ],
    note: "Bookings are normally made at least 2 days before your preferred rental date. Day-before and same-day requests may be accepted subject to availability and approval. The ₱300 rush fee is charged only when you book for pickup or delivery that same day.",
  },
  {
    title: "Complete Your Booking",
    description:
      "Once your schedule shows as available, continue through the booking form. Review the privacy notice and rental terms, enter your renter details, then provide these details and uploads:",
    bullets: [
      "Facebook account name and profile link",
      "2 Valid IDs (1 must be a Government ID)",
      "Utility Bill OR recent Shopee / Lazada / TikTok waybill (for Proof of Residence)",
      "Quick selfie holding your IDs",
      "Proof of 20% Downpayment (deductible from your total bill)",
    ],
    note: "Your booking is only confirmed once all requirements are submitted, verification is approved, and the 20% downpayment has been settled.",
  },
  {
    title: "Review, Sign & Submit",
    description:
      "Make sure all uploaded IDs, photos, and documents are clear and valid. Review your booking and rental contract, add your e-signature, then submit everything directly through this website.",
    note: "Keep your booking reference and send us your downloaded or screenshot contract via PM. We'll review your request and message you on Facebook with the official confirmation of your reservation.",
  },
  {
    title: "Handover / Pickup / Delivery",
    description:
      "We operate around Bulacan, Manila, and Laguna only. Pickup and delivery options depend on your area:",
    bullets: [
      "Bulacan: Maasim, San Ildefonso pickup or delivery",
      "Manila & Cavite: Delivery only",
      "Laguna: Malamig, Biñan pickup or DLSU Laguna or delivery",
    ],
    note: "Before release, settle the remaining balance, pay the ₱1,000 refundable security deposit, and sign the lease contract. For delivery, our own rider handles drop-off and return — delays past the agreed schedule are still charged as extended hours.",
  },
];

export const TERMS = [
  {
    title: "Booking & Verification",
    items: [
      "Strict Reservation Policy: Your slot is only confirmed once all steps are completed, requirements are submitted, verification is approved, and the downpayment is settled. We do not reserve dates without payment.",
      "First-Come, First-Served: Availability is based on who completes the booking process first.",
      "Booking Lead Time: Bookings should normally be made at least 2 days before the preferred rental date. Day-before and same-day requests are subject to availability and approval.",
      "Rush Booking: A ₱300 rush fee is charged only when the pickup or delivery date is the same date the booking is submitted.",
      "Requirements: Renters must provide a legitimate Facebook account, 2 valid IDs, proof of residence or waybill, selfie verification, and any other details requested in our website booking form.",
      "Right of Refusal: We reserve the right to decline rental requests at our discretion.",
    ],
  },
  {
    title: "Payments & Fees",
    items: [
      "Reservation Fee: A 20% downpayment is required. This is non-refundable but deductible from the total rental fee.",
      "Security Deposit: A ₱1,000 security deposit is required before releasing the unit. This is fully refundable upon the safe and complete return of the equipment.",
      "Full Balance: The remaining balance must be settled in full before the unit is released.",
      "Delivery Fee: For delivery and return, the renter is responsible for the delivery fee — our own rider handles the trip both ways.",
      "Rush Fee: A ₱300 rush fee applies only when you submit a booking for pickup or delivery that same day. It does not apply to day-before or earlier bookings.",
    ],
  },
  {
    title: "Rental Period, Cancellations & Extensions",
    items: [
      "Rental Computation: Rental is based on a 24-hour cycle.",
      "Confirmed Schedule: The rental period starts based on the confirmed pickup / delivery date and time stated in the submitted booking request.",
      "Return Time: The unit must be returned on or before the confirmed return date and time stated in the submitted booking request.",
      "Late Return / Delivery Delays: For delivery and return, pickup and return times must be coordinated with us in advance. If the unit is returned later than the confirmed return schedule, the extra time will be charged as extended hours.",
      "Cancellations: Downpayments are strictly non-refundable.",
      "Rescheduling: Rescheduling requests must be made at least 3 days before the rental date and are subject to availability.",
      "Extensions: Extensions are subject to unit availability. Full payment for the extra hours or day/s must be settled immediately to secure the extension.",
      "Early Return: Renters may return the unit early, but unused time or days are non-refundable.",
    ],
  },
  {
    title: "Liability & Late Returns",
    items: [
      "Damage & Loss: Renters are 100% liable for the rented equipment. Any damage, loss, missing accessory, or issue caused during the rental period must be paid in full.",
      "Late Fees: Late returns will be charged ₱50 per hour. Returns more than 3 hours late will be charged as one full additional rental day.",
      "Return Condition: The unit must be returned in the same working condition, including all included accessories, packaging, and items released with the unit.",
      "Unreturned Unit: Failure to return the unit on the agreed return date may result in additional charges and possible legal action.",
    ],
  },
];

export const FAQS = [
  {
    q: "Where are you located?",
    a: "We operate around Bulacan, Manila, and Laguna.",
  },
  {
    q: "Do you allow meetups?",
    a: "No. We only allow self-pickup or delivery, depending on your preference.",
  },
  {
    q: "What are the pickup or delivery options per area?",
    a: "Bulacan: Maasim, San Ildefonso pickup or delivery. Manila & Cavite: Delivery only. Laguna: Malamig, Biñan pickup or DLSU Laguna or delivery.",
  },
  {
    q: "Who handles the delivery?",
    a: "We do. S&R Rentals' own rider delivers and picks up the unit, so you don't need to book anything yourself — he can also walk you through the camera on drop-off.",
  },
  {
    q: "Do I need to arrange the return delivery myself?",
    a: "No. Our rider will coordinate the pickup with you directly — just make sure the unit and its accessories are ready on or before the confirmed return time.",
  },
  {
    q: "When is my booking confirmed?",
    a: "Your booking is confirmed only after all requirements are submitted, verification is approved, and the 20% downpayment is settled.",
  },
  {
    q: "Can I book for someone else?",
    a: "No. The person who undergoes the verification process must be the same person who will rent and use the equipment.",
  },
  {
    q: "Can I bring the camera on international trips?",
    a: "Yes, as long as this is declared during booking and approved during verification.",
  },
  {
    q: "Can I book on the same day or the day before?",
    a: "Yes, subject to availability and approval. The ₱300 rush fee is charged only when you book for pickup or delivery that same day; there is no rush fee for a day-before booking.",
  },
  {
    q: "How is the rental period computed?",
    a: "Rental is based on a 24-hour cycle. The rental starts from the confirmed pickup / delivery date and time stated in your booking request.",
  },
  {
    q: "Is the downpayment refundable?",
    a: "No. Downpayments are strictly non-refundable but deductible from your total rental fee.",
  },
  {
    q: "Is a security deposit required?",
    a: "Yes, a ₱1,000 security deposit is required before the unit is released. This is fully refundable upon the safe and complete return of the unit.",
  },
  {
    q: "What time should I return the camera?",
    a: "The camera must be returned on or before the confirmed return date and time stated in your booking request.",
  },
  {
    q: "What if the delivery or pickup is delayed?",
    a: "If the return is delayed past the confirmed time, the extra time will be charged as extended hours — please coordinate any schedule changes with us as early as possible.",
  },
  {
    q: "Can I extend my rental?",
    a: "Yes, as long as the unit is not reserved by another client. Please inform us in advance. Full payment for the extension must be settled immediately.",
  },
  {
    q: "What if I need to return it early?",
    a: "You may return it early, but unused days or hours are non-refundable.",
  },
  {
    q: "What happens if the camera or accessories are damaged or lost?",
    a: "The renter is 100% liable for any damage, loss, missing accessory, or issue caused during the rental period. Charges must be paid in full.",
  },
];

export const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Cameras", href: "#cameras" },
  { label: "How to Rent", href: "#how-to-rent" },
  { label: "Rewards", href: "#rewards" },
  { label: "Terms", href: "#terms" },
  { label: "FAQs", href: "#faqs" },
  { label: "Contact", href: "#contact" },
];
