const { getFirestore } = require("./firebase");

// Sample shots — posts of photos taken with each camera, shown on the public
// site's Gallery, one folder per camera. A post is like a Facebook post: one
// caption and 1–10 photos.
//
// Firestore collection `sampleShots`, one doc per POST:
//   { cameraId, cameraName, caption, photos: [{ id, thumb, width, height }],
//     createdAt, updatedAt }
// with each photo's full-size JPEG in a sub-collection:
//   sampleShots/{postId}/photos/{photoId}  { image }
//
// Why split: Cloud Storage needs the paid Blaze plan, so photos are data URLs
// in Firestore, and a doc is capped at 1 MiB. Thumbnails (≤400px) for up to
// 10 photos fit on the post; full photos (≤1600px) get a doc each. The list
// therefore never carries a full photo — each is fetched on its own.
//
// Older posts (before albums) have `image` + `thumb` on the post doc itself
// and no `photos`; they read as a one-photo post whose photo id is "0".

const COLLECTION = "sampleShots";
const MAX_PHOTOS = 10;
const MAX_IMAGE_CHARS = 850_000; // data URL length, ~620 KB of JPEG
const MAX_THUMB_CHARS = 80_000;
const MAX_CAPTION = 1000;
const LEGACY_PHOTO_ID = "0";

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

function photosOf(d) {
  if (Array.isArray(d.photos)) return d.photos;
  if (d.thumb) return [{ id: LEGACY_PHOTO_ID, thumb: d.thumb, width: d.width || null, height: d.height || null }];
  return [];
}

function out(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    cameraId: d.cameraId,
    cameraName: d.cameraName,
    caption: d.caption || "",
    photos: photosOf(d).map((p) => ({ id: p.id, thumb: p.thumb, width: p.width || null, height: p.height || null })),
    createdAt: d.createdAt,
  };
}

/** Every post, newest first, thumbnails only. */
async function listShots() {
  const snap = await col()
    .select("cameraId", "cameraName", "caption", "photos", "thumb", "width", "height", "createdAt")
    .get();
  return snap.docs.map(out).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** One photo of a post at full size: { postId, photoId, image } or null. */
async function getPhoto(postId, photoId) {
  const ref = col().doc(String(postId));
  if (String(photoId ?? LEGACY_PHOTO_ID) === LEGACY_PHOTO_ID) {
    const doc = await ref.get();
    if (doc.exists && doc.data().image) return { postId: doc.id, photoId: LEGACY_PHOTO_ID, image: doc.data().image };
  }
  const p = await ref.collection("photos").doc(String(photoId)).get();
  if (!p.exists) return null;
  return { postId: String(postId), photoId: p.id, image: p.data().image };
}

/**
 * Creates the post with its thumbnails. The full photos follow one request
 * each (putPhoto) — together they would pass Vercel's 4.5 MB body limit.
 */
async function createShot(body, cameras) {
  const camera = cameras.find((c) => c.id === body.cameraId);
  if (!camera) throw new SampleShotError("Pick which camera took these photos.");
  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (photos.length === 0) throw new SampleShotError("Add at least one photo.");
  if (photos.length > MAX_PHOTOS) throw new SampleShotError(`A post can have up to ${MAX_PHOTOS} photos.`);
  for (const p of photos) {
    if (!isJpegDataUrl(p.thumb)) throw new SampleShotError("Upload photos (JPEG).");
    if (p.thumb.length > MAX_THUMB_CHARS) throw new SampleShotError("A photo preview is too large. Try again.");
  }
  const now = new Date().toISOString();
  const data = {
    cameraId: camera.id,
    cameraName: camera.name,
    caption: cleanCaption(body.caption),
    photos: photos.map((p, i) => ({
      id: `p${i + 1}`,
      thumb: p.thumb,
      width: Number(p.width) || null,
      height: Number(p.height) || null,
    })),
    createdAt: now,
    updatedAt: now,
  };
  const ref = await col().add(data);
  return { id: ref.id, ...data };
}

/** Stores one photo's full-size image for a post created by createShot. */
async function putPhoto(postId, photoId, body) {
  const ref = col().doc(String(postId));
  const doc = await ref.get();
  if (!doc.exists) return null;
  if (!photosOf(doc.data()).some((p) => p.id === String(photoId))) {
    throw new SampleShotError("That photo is not part of this post.");
  }
  if (!isJpegDataUrl(body.image)) throw new SampleShotError("Upload a photo (JPEG).");
  if (body.image.length > MAX_IMAGE_CHARS) throw new SampleShotError("That photo is too large after resizing.");
  await ref.collection("photos").doc(String(photoId)).set({ image: body.image });
  return true;
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
  const photos = await ref.collection("photos").get();
  const batch = getFirestore().batch();
  photos.docs.forEach((p) => batch.delete(p.ref));
  batch.delete(ref);
  await batch.commit();
  return true;
}

module.exports = {
  SampleShotError,
  MAX_PHOTOS,
  listShots,
  getPhoto,
  createShot,
  putPhoto,
  updateShot,
  deleteShot,
};
