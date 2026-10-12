// The camera catalogue as it stood when the app moved to Firebase.
//
// This is NOT read at runtime in DATASOURCE=firebase — the live catalogue is
// the Firestore `cameras` collection, edited from the admin Catalog page. This
// file only seeds that collection the first time (POST /api/catalog?action=seed,
// the "Load default cameras" button), and only while it is empty.
//
// Merged from the three hand-maintained copies that existed before:
//   pricing, priceHistory, unitHistory, addOns  ← admin frontend/src/data/cameras.js
//   tag, inclusions                             ← client src/data/content.js
//   image, detailImage                          ← client src/data/assets.js (paths on the client site)
//   goodFor, perfectFor                         ← client src/data/detailCopy.js
//
// Rate card change on 2026-08-20: day bands went from 1-3/4+ to 1-2/3-4/5+,
// and the G7X and X-T100 got cheaper. That is what every priceHistory entry
// records. The Pocket 3 went from 3 units to 2 the same day (one sold).
const DEFAULT_CATALOG = [
  {
    "id": "dji-osmo-360",
    "name": "DJI Osmo 360",
    "tag": "Adventure Combo",
    "active": true,
    "sortOrder": 0,
    "units": 2,
    "pricing": [
      {
        "minDays": 1,
        "maxDays": 2,
        "pricePerDay": 550
      },
      {
        "minDays": 3,
        "maxDays": 4,
        "pricePerDay": 500
      },
      {
        "minDays": 5,
        "maxDays": null,
        "pricePerDay": 450
      }
    ],
    "priceHistory": [
      {
        "before": "2026-08-20",
        "pricing": [
          {
            "minDays": 1,
            "maxDays": 3,
            "pricePerDay": 550
          },
          {
            "minDays": 4,
            "maxDays": null,
            "pricePerDay": 500
          }
        ]
      }
    ],
    "addOns": [
      {
        "name": "Double Crab Clamp",
        "pricePerDay": 40
      },
      {
        "name": "Long Invisible Stick (3 meters)",
        "pricePerDay": 50
      },
      {
        "name": "Bullet Time Tripod",
        "pricePerDay": 40
      },
      {
        "name": "Quadpod Stand",
        "pricePerDay": 40
      },
      {
        "name": "256GB SD Card",
        "pricePerDay": 60
      },
      {
        "name": "512GB SD Card",
        "pricePerDay": 80
      },
      {
        "name": "Extra 2 Batteries",
        "pricePerDay": 80
      }
    ],
    "inclusions": [
      "128GB SD Card",
      "3 Batteries",
      "Camera pouch",
      "Battery case",
      "Quick-release mount",
      "Lens cleaning cloth",
      "Charger cable",
      "Silicon protector",
      "Invisible selfie stick"
    ],
    "image": "/osmo360.png",
    "detailImage": "/osmo360-inclusions.png",
    "goodFor": "360 travel videos, adventure clips, and wide outdoor coverage.",
    "perfectFor": "Beach trips, rides, hiking, and immersive group memories."
  },
  {
    "id": "dji-osmo-pocket-3",
    "name": "DJI OSMO POCKET 3",
    "tag": "Creator Combo",
    "active": true,
    "sortOrder": 1,
    "units": 2,
    "pricing": [
      {
        "minDays": 1,
        "maxDays": 2,
        "pricePerDay": 550
      },
      {
        "minDays": 3,
        "maxDays": 4,
        "pricePerDay": 500
      },
      {
        "minDays": 5,
        "maxDays": null,
        "pricePerDay": 450
      }
    ],
    "priceHistory": [
      {
        "before": "2026-08-20",
        "pricing": [
          {
            "minDays": 1,
            "maxDays": 3,
            "pricePerDay": 550
          },
          {
            "minDays": 4,
            "maxDays": null,
            "pricePerDay": 500
          }
        ]
      }
    ],
    "unitHistory": [
      {
        "before": "2026-08-20",
        "units": 3
      }
    ],
    "addOns": [
      {
        "name": "512GB SD Card",
        "pricePerDay": 80
      },
      {
        "name": "Extended Battery Handle",
        "pricePerDay": 50
      },
      {
        "name": "Mini Mic",
        "pricePerDay": 50
      },
      {
        "name": "Magnetic Mount",
        "pricePerDay": 50
      },
      {
        "name": "Quadpod Stand",
        "pricePerDay": 40
      },
      {
        "name": "256GB SD Card",
        "pricePerDay": 60
      }
    ],
    "inclusions": [
      "128GB SD Card",
      "Type-C to Type-C Cable",
      "Protective Cover",
      "Mic 2 Transmitter",
      "Mic 2 Clip Magnet",
      "Mic 2 Windscreen",
      "Wrist Strap",
      "Handle with 1/4\" Thread",
      "Carrying Bag",
      "Wide-Angle Lens",
      "Mini tripod",
      "Battery Handle"
    ],
    "image": "/osmopocket3.png",
    "detailImage": "/osmopocket3-inclusions.png",
    "goodFor": "Smooth vlogs, events, and walk-and-talk videos.",
    "perfectFor": "Birthdays, reels, content shoots, and low-light indoor scenes."
  },
  {
    "id": "dji-osmo-nano",
    "name": "DJI Osmo Nano",
    "tag": "Standard Combo - 128GB",
    "active": true,
    "sortOrder": 2,
    "units": 2,
    "pricing": [
      {
        "minDays": 1,
        "maxDays": 2,
        "pricePerDay": 500
      },
      {
        "minDays": 3,
        "maxDays": 4,
        "pricePerDay": 450
      },
      {
        "minDays": 5,
        "maxDays": null,
        "pricePerDay": 400
      }
    ],
    "priceHistory": [
      {
        "before": "2026-08-20",
        "pricing": [
          {
            "minDays": 1,
            "maxDays": 3,
            "pricePerDay": 500
          },
          {
            "minDays": 4,
            "maxDays": null,
            "pricePerDay": 450
          }
        ]
      }
    ],
    "addOns": [],
    "inclusions": [
      "128GB SD Card",
      "Type-C to Type-C Cable",
      "Magnetic lanyard",
      "Ball joint adapter mount",
      "Magnetic Hat clip",
      "Mini Tripod"
    ],
    "image": "/osmonano.png",
    "detailImage": "/osmonano-inclusions.png",
    "goodFor": "Hands-free POV shots and light travel content.",
    "perfectFor": "Casual trips, daily vlogs, and quick action moments."
  },
  {
    "id": "insta360-ace-pro-2",
    "name": "INSTA360 ACE PRO 2",
    "tag": "Xplorer Bundle",
    "active": true,
    "sortOrder": 3,
    "units": 2,
    "pricing": [
      {
        "minDays": 1,
        "maxDays": 2,
        "pricePerDay": 550
      },
      {
        "minDays": 3,
        "maxDays": 4,
        "pricePerDay": 500
      },
      {
        "minDays": 5,
        "maxDays": null,
        "pricePerDay": 450
      }
    ],
    "priceHistory": [
      {
        "before": "2026-08-20",
        "pricing": [
          {
            "minDays": 1,
            "maxDays": 3,
            "pricePerDay": 550
          },
          {
            "minDays": 4,
            "maxDays": null,
            "pricePerDay": 500
          }
        ]
      }
    ],
    "addOns": [
      {
        "name": "Double Crab Clamp",
        "pricePerDay": 40
      },
      {
        "name": "Dive Case",
        "pricePerDay": 80
      },
      {
        "name": "Magnetic Neck Mount",
        "pricePerDay": 40
      },
      {
        "name": "Quadpod Stand",
        "pricePerDay": 40
      },
      {
        "name": "256GB SD Card",
        "pricePerDay": 60
      },
      {
        "name": "512GB SD Card",
        "pricePerDay": 80
      },
      {
        "name": "Extra AcePro Battery",
        "pricePerDay": 80
      }
    ],
    "inclusions": [
      "128GB SD Card",
      "Type-C to Type-C Cable",
      "2 Batteries",
      "Mini Tripod",
      "Standard Action Mount",
      "Wrist Strap",
      "Mic Cap"
    ],
    "image": "/acepro2.png",
    "detailImage": "/acepro2-inclusion.png",
    "goodFor": "Action clips, travel videos, and crisp outdoor footage.",
    "perfectFor": "Water activities, rides, hikes, and sports-style content."
  },
  {
    "id": "canon-g7x-mark-iii",
    "name": "CANON G7X MARK III",
    "tag": "Vlog Compact",
    "active": true,
    "sortOrder": 4,
    "units": 4,
    "pricing": [
      {
        "minDays": 1,
        "maxDays": 2,
        "pricePerDay": 600
      },
      {
        "minDays": 3,
        "maxDays": 4,
        "pricePerDay": 550
      },
      {
        "minDays": 5,
        "maxDays": null,
        "pricePerDay": 500
      }
    ],
    "priceHistory": [
      {
        "before": "2026-08-20",
        "pricing": [
          {
            "minDays": 1,
            "maxDays": 3,
            "pricePerDay": 700
          },
          {
            "minDays": 4,
            "maxDays": null,
            "pricePerDay": 650
          }
        ]
      }
    ],
    "addOns": [
      {
        "name": "Extra G7X Battery",
        "pricePerDay": 50
      },
      {
        "name": "Camera Tripod",
        "pricePerDay": 50
      },
      {
        "name": "Mini Tripod",
        "pricePerDay": 40
      },
      {
        "name": "128GB SD Card",
        "pricePerDay": 50
      }
    ],
    "inclusions": [
      "32GB Memory Card",
      "Charger",
      "1 Battery",
      "Silicone Case",
      "Camera Bag",
      "Strap",
      "SD Card reader"
    ],
    "image": "/canong7x.png",
    "detailImage": "/canong7x-insclusions.png",
    "goodFor": "Clean photos, vlogs, and classic compact-camera content.",
    "perfectFor": "Events, travel photos, portraits, and creator shoots."
  },
  {
    "id": "fujifilm-x-t100",
    "name": "FUJIFILM X-T100",
    "tag": "Mirrorless",
    "active": true,
    "sortOrder": 5,
    "units": 2,
    "pricing": [
      {
        "minDays": 1,
        "maxDays": 2,
        "pricePerDay": 550
      },
      {
        "minDays": 3,
        "maxDays": 4,
        "pricePerDay": 500
      },
      {
        "minDays": 5,
        "maxDays": null,
        "pricePerDay": 450
      }
    ],
    "priceHistory": [
      {
        "before": "2026-08-20",
        "pricing": [
          {
            "minDays": 1,
            "maxDays": 3,
            "pricePerDay": 600
          },
          {
            "minDays": 4,
            "maxDays": null,
            "pricePerDay": 550
          }
        ]
      }
    ],
    "addOns": [
      {
        "name": "Extra X-T100 Battery",
        "pricePerDay": 50
      },
      {
        "name": "Camera Tripod",
        "pricePerDay": 50
      },
      {
        "name": "Mini Tripod",
        "pricePerDay": 40
      },
      {
        "name": "128GB SD Card",
        "pricePerDay": 50
      },
      {
        "name": "25mm f1.8 Prime Lens",
        "pricePerDay": 150
      },
      {
        "name": "85mm f1.8 Prime Lens",
        "pricePerDay": 200
      }
    ],
    "inclusions": [
      "32GB Memory Card",
      "Charger",
      "1 Battery",
      "Kit Lens",
      "Camera Bag",
      "Strap",
      "SD Card reader"
    ],
    "image": "/fujifilm.png",
    "detailImage": "/fujifilm-inclusions.png",
    "goodFor": "Photo shoots, portraits, and soft editorial-looking images.",
    "perfectFor": "Graduation shoots, cafe content, outfit photos, and events."
  },
  {
    "id": "canon-eos-r50",
    "name": "CANON EOS R50",
    "tag": "Mirrorless",
    "active": true,
    "sortOrder": 6,
    "units": 1,
    "pricing": [
      {
        "minDays": 1,
        "maxDays": 2,
        "pricePerDay": 600
      },
      {
        "minDays": 3,
        "maxDays": 4,
        "pricePerDay": 550
      },
      {
        "minDays": 5,
        "maxDays": null,
        "pricePerDay": 500
      }
    ],
    "addOns": [
      {
        "name": "Extra R50 Battery",
        "pricePerDay": 50
      },
      {
        "name": "Camera Tripod",
        "pricePerDay": 50
      },
      {
        "name": "Mini Tripod",
        "pricePerDay": 40
      },
      {
        "name": "128GB SD Card",
        "pricePerDay": 50
      }
    ],
    "inclusions": [
      "32GB Memory Card",
      "Charger",
      "1 Battery",
      "Silicone Case",
      "Camera Bag",
      "Strap",
      "SD Card reader"
    ],
    "image": "/canonr50.png",
    "detailImage": "/canonr50-inclusions.png",
    "goodFor": "Sharp photos, 4K video, and interchangeable-lens flexibility.",
    "perfectFor": "Events, portraits, travel shoots, and creator content."
  }
];

module.exports = { DEFAULT_CATALOG };
