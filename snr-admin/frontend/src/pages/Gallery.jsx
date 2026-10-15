import { useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header.jsx";
import Icon from "../components/Icon.jsx";
import { useCameras } from "../hooks/useCameras.js";
import { apiGetJson, apiPostJson, apiPatchJson, apiDeleteJson } from "../utils/api.js";
import { prepareSampleShot } from "../utils/resizeImage.js";

// Sample shots — posts of 1–10 photos taken with one camera, with one caption,
// like a Facebook album post. They show on the public site's Gallery, one folder per
// camera. Storage + API: backend/lib/sampleShots.js via /api/catalog?action=shots.

const MAX_PHOTOS = 10;

// The post's photos as a small grid (first 4; "+N" on the last one).
function PhotoStrip({ photos }) {
  if (photos.length === 0) return null;
  if (photos.length === 1) {
    return <img src={photos[0].thumb} alt="" className="aspect-[4/3] w-full object-cover" />;
  }
  const shown = photos.slice(0, 4);
  const extra = photos.length - shown.length;
  return (
    <div className={`grid aspect-[4/3] gap-0.5 ${shown.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2"}`}>
      {shown.map((p, i) => (
        <div
          key={p.id}
          className={`relative overflow-hidden ${shown.length === 3 && i === 0 ? "row-span-2" : ""}`}
        >
          <img src={p.thumb} alt="" className="h-full w-full object-cover" />
          {extra > 0 && i === shown.length - 1 && (
            <span className="absolute inset-0 grid place-items-center bg-black/50 text-xl font-bold text-white">
              +{extra}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Gallery() {
  const { cameras } = useCameras();
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [cameraId, setCameraId] = useState("");
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [posting, setPosting] = useState(null); // progress label while uploading
  const [postError, setPostError] = useState(null);
  const fileRef = useRef(null);

  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editCaption, setEditCaption] = useState("");

  useEffect(() => {
    apiGetJson("/api/catalog?action=shots")
      .then((d) => setShots(d.shots || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const counts = useMemo(() => {
    const m = {};
    shots.forEach((s) => { m[s.cameraId] = (m[s.cameraId] || 0) + 1; });
    return m;
  }, [shots]);

  const visible = filter === "all" ? shots : shots.filter((s) => s.cameraId === filter);

  function chooseFiles(list) {
    const picked = [...list];
    if (picked.length > MAX_PHOTOS) {
      setPostError(`A post can have up to ${MAX_PHOTOS} photos — the first ${MAX_PHOTOS} are kept.`);
    } else {
      setPostError(null);
    }
    setFiles(picked.slice(0, MAX_PHOTOS));
  }

  // One post = every chosen photo + one caption. The post goes up first with
  // the small previews; each full-size photo follows in its own request
  // (all at once would pass the server's 4.5 MB upload limit).
  async function handlePost(e) {
    e.preventDefault();
    if (!cameraId || files.length === 0) return;
    setPostError(null);
    const n = files.length;
    let created = null;
    try {
      const prepared = [];
      for (let i = 0; i < n; i++) {
        setPosting(n > 1 ? `Preparing photo ${i + 1} of ${n}` : "Preparing photo");
        prepared.push(await prepareSampleShot(files[i]));
      }
      setPosting("Posting");
      const res = await apiPostJson("/api/catalog?action=shots", {
        cameraId,
        caption,
        photos: prepared.map(({ thumb, width, height }) => ({ thumb, width, height })),
      });
      created = res.shot;
      for (let i = 0; i < n; i++) {
        setPosting(n > 1 ? `Uploading photo ${i + 1} of ${n}` : "Uploading photo");
        await apiPostJson(
          `/api/catalog?action=shot&id=${created.id}&photo=${created.photos[i].id}`,
          { image: prepared[i].image },
        );
      }
      setCaption("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setPostError(
        created
          ? `The post was saved but a photo didn't finish uploading (${err.message}). Delete the post below and try again.`
          : err.message,
      );
    } finally {
      if (created) setShots((prev) => [created, ...prev]);
      setPosting(null);
    }
  }

  async function saveCaption(id) {
    try {
      const res = await apiPatchJson(`/api/catalog?action=shots&id=${id}`, { caption: editCaption });
      setShots((prev) => prev.map((s) => (s.id === id ? { ...s, caption: res.shot.caption } : s)));
      setEditingId(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function remove(id) {
    const post = shots.find((s) => s.id === id);
    const n = post?.photos?.length || 1;
    if (!window.confirm(`Delete this post${n > 1 ? ` and its ${n} photos` : ""}? It will disappear from the website.`)) return;
    const before = shots;
    setShots((prev) => prev.filter((s) => s.id !== id));
    try {
      await apiDeleteJson(`/api/catalog?action=shots&id=${id}`);
    } catch (err) {
      setShots(before);
      alert(err.message);
    }
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <div className="ui-kicker">Website</div>
          <h1 className="ui-title font-display text-3xl">Sample Shots</h1>
          <p className="mt-1 text-sm text-[color:var(--color-dark-gray)]">
            Photos taken with each camera. Each post — up to {MAX_PHOTOS} photos and one caption, like a
            Facebook post — shows in that camera&apos;s folder in the website&apos;s Gallery.
          </p>
        </div>

        <form onSubmit={handlePost} className="mb-6 ui-panel p-5">
          <div className="mb-3 ui-kicker text-[0.6rem]">New post</div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block ui-kicker text-[0.6rem]">Shot on</label>
              <select
                className="ui-input"
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                required
              >
                <option value="">Choose the camera…</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block ui-kicker text-[0.6rem]">Photos</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => chooseFiles(e.target.files)}
                className="block w-full text-sm"
                required
              />
              {previews.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {previews.map((u) => (
                    <img key={u} src={u} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-[color:var(--color-dark-gray)]">
                Choose up to {MAX_PHOTOS}. They go up together as one post with your caption.
                Photos are resized before upload.
              </p>
            </div>

            <div>
              <label className="mb-1 block ui-kicker text-[0.6rem]">Caption</label>
              <textarea
                rows={3}
                maxLength={600}
                placeholder="e.g. Sunset at La Union, shot handheld on the Osmo Pocket 3"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="ui-input"
              />
            </div>

            {postError && <p className="text-xs text-rose-500">{postError}</p>}
            <div className="flex justify-end">
              <button type="submit" disabled={Boolean(posting)} className="ui-btn ui-btn--solid">
                {posting ? `${posting}…` : files.length > 1 ? `Post ${files.length} photos` : "Post"}
              </button>
            </div>
          </div>
        </form>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`ui-btn ui-btn--sm ${filter === "all" ? "ui-btn--solid" : ""}`}
          >
            All ({shots.length})
          </button>
          {cameras.filter((c) => counts[c.id]).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`ui-btn ui-btn--sm ${filter === c.id ? "ui-btn--solid" : ""}`}
            >
              {c.name} ({counts[c.id]})
            </button>
          ))}
        </div>

        {loading && <p className="ui-card px-4 py-3 text-xs text-[color:var(--color-dark-gray)]">Loading…</p>}
        {error && <p className="text-xs text-rose-500">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="ui-card px-4 py-6 text-center text-sm text-[color:var(--color-dark-gray)]">
            No sample shots yet. Post the first one above.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visible.map((s) => (
            <article key={s.id} className="ui-panel overflow-hidden">
              <PhotoStrip photos={s.photos || []} />
              <div className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold">{s.cameraName}</span>
                  <span className="text-xs text-[color:var(--color-dark-gray)]">
                    {(s.photos?.length || 0) > 1 ? `${s.photos.length} photos · ` : ""}{formatDate(s.createdAt)}
                  </span>
                </div>
                {editingId === s.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      rows={3}
                      maxLength={600}
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      className="ui-input"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" className="ui-btn ui-btn--sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                      <button type="button" className="ui-btn ui-btn--sm ui-btn--solid" onClick={() => saveCaption(s.id)}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-line text-sm text-[color:var(--color-ink)]">
                    {s.caption || <span className="text-[color:var(--color-dark-gray)]">No caption</span>}
                  </p>
                )}
                {editingId !== s.id && (
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      className="ui-btn ui-btn--sm"
                      onClick={() => { setEditingId(s.id); setEditCaption(s.caption || ""); }}
                    >
                      Edit caption
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn--sm"
                      onClick={() => remove(s.id)}
                      aria-label="Delete sample shot"
                    >
                      <Icon name="x" size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
