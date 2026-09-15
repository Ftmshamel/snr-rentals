const STANDARD_TERMS = [
  "Liability: The Renter assumes full responsibility for the equipment. In case of damage, the Renter agrees to pay the repair costs as assessed by an authorized service center. In case of loss or irreparable damage, the Renter agrees to pay the full replacement value of the unit.",
  "Cosmetic Damage & Scratches: Scratches significantly lower the resale value of our cameras. If the equipment is returned with new scratches on the body, screen, or lens, the following fees apply:",
  "Security Deposit: The ₱1,000 deposit will be refunded upon return of the equipment in the same condition as it was released. SnR Rentals reserves the right to deduct from this deposit for any missing accessories or minor damages.",
  "Late Returns: A penalty of ₱50 per hour will be charged for late returns. Delays exceeding 3 hours will result in an automatic 1-day rental extension being charged.",
  "Usage: The Renter agrees to use the equipment in a lawful and careful manner. Sub-leasing (renting it to others) is strictly prohibited.",
  "Data Privacy:SnR Rentals is not responsible for any files left on the SD card after the return.",
];

function withScratchFees(fees) {
  return [
    STANDARD_TERMS[0],
    STANDARD_TERMS[1],
    ...fees,
    ...STANDARD_TERMS.slice(2),
  ];
}

const CONTRACTS = {
  "DJI Osmo 360": {
    unit: "DJI Osmo 360",
    terms: [
      "Liability: The Renter assumes full responsibility for the equipment. In case of loss or irreparable damage, the Renter agrees to pay the full replacement value of the unit. For specific damages, the following fixed fees apply:",
      "Lens Damage: A fee of ₱1,500 per scratched lens (₱3,000 for both lenses).",
      "Screen Damage: A fee ranging from ₱500 to ₱1,000 depending on the severity of the damage.",
      "Other Damages: For all other issues, the Renter agrees to pay repair costs as assessed by an authorized service center.",
      ...STANDARD_TERMS.slice(2),
    ],
  },
  "DJI OSMO POCKET 3": {
    unit: "DJI Osmo Pocket 3",
    terms: withScratchFees([
      "Mild scratch: ₱1,000",
      "Medium scratch: ₱5,000",
      "Major/deep scratch: ₱8,000",
    ]),
  },
  "DJI Osmo Nano": {
    unit: "DJI Osmo Nano",
    terms: withScratchFees([
      "Mild scratch: ₱1,000",
      "Medium scratch: ₱5,000",
      "Major/deep scratch: ₱8,000",
    ]),
  },
  "INSTA360 ACE PRO 2": {
    unit: "INSTA360 Ace Pro 2",
    terms: withScratchFees([
      "Mild scratch: ₱1,000",
      "Medium scratch: ₱5,000",
      "Major/deep scratch: ₱8,000",
    ]),
  },
  "FUJIFILM X-T100": {
    unit: "FUJIFILM X-T100",
    terms: withScratchFees([
      "Mild scratch: ₱2,000",
      "Medium scratch: ₱4,000",
      "Major/deep scratch: ₱6,000",
    ]),
  },
  "CANON G7X MARK III": {
    unit: "Canon G7X Mark III",
    terms: withScratchFees([
      "Mild scratch: ₱3,000",
      "Medium scratch: ₱5,000",
      "Major/deep scratch: ₱10,000",
    ]),
  },
  "CANON EOS R50": {
    unit: "Canon EOS R50",
    // TODO — CONFIRM THESE AMOUNTS. The R50's scratch fees were never
    // specified; these are copied from the Canon G7X Mark III as the nearest
    // equivalent. They appear verbatim in the contract the renter signs, so
    // correct them before the first R50 rental goes out.
    terms: withScratchFees([
      "Mild scratch: ₱3,000",
      "Medium scratch: ₱5,000",
      "Major/deep scratch: ₱10,000",
    ]),
  },
};

const ALIASES = {
  "DJI Osmo Pocket 3": "DJI OSMO POCKET 3",
  "INSTA360 Ace Pro 2": "INSTA360 ACE PRO 2",
  "CANON G7X Mark III": "CANON G7X MARK III",
  "Canon G7X Mark III": "CANON G7X MARK III",
  "CANON EOS R50": "CANON EOS R50",
  "Canon EOS R50": "CANON EOS R50",
};

export function getContractForCamera(cameraName) {
  const key = ALIASES[cameraName] || cameraName;
  return CONTRACTS[key] || {
    unit: cameraName || "Selected Camera",
    terms: STANDARD_TERMS,
  };
}
