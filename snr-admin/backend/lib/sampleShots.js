const { getFirestore } = require("./firebase");

// Sample shots — photos taken with each camera, posted with a caption like a
// Facebook post and shown in the public site's Gallery, one folder per camera.
//
// Firestore collection `sampleShots`, one doc per photo:
//   { cameraId, cameraName, caption, image, thumb, width, height, createdAt, updatedAt }
//
// `image` (≤1600px) and `thumb` (≤480px) are JPEG data URLs, resized in the
// admin's browser before upload. They live on the doc itself because Cloud
// Storage needs the paid Blaze plan; the size caps below keep each doc well
// under Firestore's 1 MiB limit. The list never returns `image` (it uses
// select()), so the gallery loads thumbnails only; one shot's full photo is
// fetched on its own.

const COLLECTION = "sampleShots";
const MAX_IMAGE_CHARS = 850_000; // data URL length, ~620 KB of JPEG
const MAX_THUMB_CHARS = 120_000;
const MAX_CAPTION = 600;

class SampleShotError extends Error {}

function col() {
  return getFirestore().collection(COLLECTION);
}

function isJpegDataUrl(v) {
  return typeof v === "string" && /^data:image\/(jpeg|jpg|webp);base64,/.test(v);
}

function cleanCaption(v) {
  return String(v || "").replace(/\r\n/g, "\n").trim().slice(0, MAX_CAPTION);
}

function out(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    cameraId: d.cameraId,
    cameraName: d.cameraName,
    caption: d.caption || "",
    thumb: d.thumb || null,
    width: d.width || null,
    height: d.height || null,
    createdAt: d.createdAt,
  };
}

/** Every shot, newest first, thumbnails only. */
async function listShots() {
  const snap = await col()
    .select("cameraId", "cameraName", "caption", "thumb", "width", "height", "createdAt")
    .get();
  return snap.docs.map(out).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** One shot with its full-size photo. */
async function getShot(id) {
  const doc = await col().doc(String(id)).get();
  if (!doc.exists) return null;
  return { ...out(doc), image: doc.data().image };
}

async function createShot(body, cameras) {
  const camera = cameras.find((c) => c.id === body.cameraId);
  if (!camera) throw new SampleShotError("Pick which camera took this photo.");
  if (!isJpegDataUrl(body.image) || !isJpegDataUrl(body.thumb)) {
    throw new SampleShotError("Upload a photo (JPEG).");
  }
  if (body.image.length > MAX_IMAGE_CHARS || body.thumb.length > MAX_THUMB_CHARS) {
    throw new SampleShotError("That photo is too large after resizing. Try a smaller one.");
  }
  const now = new Date().toISOString();
  const data = {
    cameraId: camera.id,
    cameraName: camera.name,
    caption: cleanCaption(body.caption),
    image: body.image,
    thumb: body.thumb,
    width: Number(body.width) || null,
    height: Number(body.height) || null,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await col().add(data);
  return { id: ref.id, ...data, image: undefined };
}

async function updateShot(id, body, cameras) {
  const ref = col().doc(String(id));
  const doc = await ref.get();
  if (!doc.exists) return null;
  const patch = { updatedAt: new Date().toISOString() };
  if (body.caption !== undefined) patch.caption = cleanCaption(body.caption);
  if (body.cameraId !== undefined) {
    const camera = cameras.find((c) => c.id === body.cameraId);
    if (!camera) throw new SampleShotError("Unknown camera.");
    patch.cameraId = camera.id;
    patch.cameraName = camera.name;
  }
  await ref.update(patch);
  return out(await ref.get());
}

async function deleteShot(id) {
  const ref = col().doc(String(id));
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}

module.exports = { SampleShotError, listShots, getShot, createShot, updateShot, deleteShot };
