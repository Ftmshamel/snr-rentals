// Shrinks a photo in the browser before upload: sample shots are stored on
// their Firestore doc (no Cloud Storage on the free plan), which caps a doc at
// 1 MiB, and a phone photo is often 4–10 MB. Returns a JPEG data URL no wider
// or taller than `maxSide`, stepping quality down until it fits `maxChars`.

async function decode(file) {
  // createImageBitmap applies the EXIF rotation, so portrait phone photos
  // don't come out sideways.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(source, maxSide, maxChars) {
  const w0 = source.width;
  const h0 = source.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNGs would otherwise turn black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  for (const q of [0.85, 0.78, 0.7, 0.6, 0.5, 0.4]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= maxChars) return { url, width: w, height: h };
  }
  return null;
}

/** { image, thumb, width, height } for one photo of a sample-shot post */
export async function prepareSampleShot(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Choose a photo file.");
  const source = await decode(file);
  const full = toJpeg(source, 1600, 800_000) || toJpeg(source, 1200, 800_000);
  // Up to 10 thumbnails share the post doc (1 MiB cap), so keep them small.
  const thumb = toJpeg(source, 400, 75_000) || toJpeg(source, 300, 75_000);
  if (source.close) source.close();
  if (!full || !thumb) throw new Error("This photo is too large to upload. Try another one.");
  return { image: full.url, thumb: thumb.url, width: full.width, height: full.height };
}
