const CAMERA_DETAIL_COPY = {
  "DJI Osmo 360": {
    goodFor: "360 travel videos, adventure clips, and wide outdoor coverage.",
    perfectFor: "Beach trips, rides, hiking, and immersive group memories.",
  },
  "DJI Osmo Pocket 3": {
    goodFor: "Smooth vlogs, events, and walk-and-talk videos.",
    perfectFor: "Birthdays, reels, content shoots, and low-light indoor scenes.",
  },
  "DJI Osmo Nano": {
    goodFor: "Hands-free POV shots and light travel content.",
    perfectFor: "Casual trips, daily vlogs, and quick action moments.",
  },
  "INSTA360 Ace Pro 2": {
    goodFor: "Action clips, travel videos, and crisp outdoor footage.",
    perfectFor: "Water activities, rides, hikes, and sports-style content.",
  },
  "CANON G7X MARK III": {
    goodFor: "Clean photos, vlogs, and classic compact-camera content.",
    perfectFor: "Events, travel photos, portraits, and creator shoots.",
  },
  "CANON G7X Mark III": {
    goodFor: "Clean photos, vlogs, and classic compact-camera content.",
    perfectFor: "Events, travel photos, portraits, and creator shoots.",
  },
  "FUJIFILM X-T100": {
    goodFor: "Photo shoots, portraits, and soft editorial-looking images.",
    perfectFor: "Graduation shoots, cafe content, outfit photos, and events.",
  },
  "CANON EOS R50": {
    goodFor: "Sharp photos, 4K video, and interchangeable-lens flexibility.",
    perfectFor: "Events, portraits, travel shoots, and creator content.",
  },
  "Canon EOS R50": {
    goodFor: "Sharp photos, 4K video, and interchangeable-lens flexibility.",
    perfectFor: "Events, portraits, travel shoots, and creator content.",
  },
};

export function getCameraDetailCopy(cameraName) {
  const normalized = String(cameraName || "").trim().toLowerCase();
  return (
    CAMERA_DETAIL_COPY[cameraName] ||
    Object.entries(CAMERA_DETAIL_COPY).find(
      ([name]) => name.toLowerCase() === normalized,
    )?.[1] || {
      goodFor: "Content shoots, travel, events, and everyday memories.",
      perfectFor: "Renters who want a ready-to-use camera kit.",
    }
  );
}
