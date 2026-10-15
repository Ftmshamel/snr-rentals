import { useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header.jsx";
import Icon from "../components/Icon.jsx";
import { useCameras } from "../hooks/useCameras.js";
import { apiGetJson, apiPostJson, apiPatchJson, apiDeleteJson } from "../utils/api.js";
import { prepareSampleShot } from "../utils/resizeImage.js";

// Sample shots — photos taken with each camera, posted with a caption like a
// Facebook post. They show on the public site's Gallery, one folder per
// camera. Storage + API: backend/lib/sampleShots.js via /api/catalog?action=shots.

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
  const [posting, setPosting] = useState(null); // "2 of 3" while uploading
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

  async function handlePost(e) {
    e.preventDefault();
    if (!cameraId || files.length === 0) return;
    setPostError(null);
    const posted = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setPosting(files.length > 1 ? `${i + 1} of ${files.length}` : "…");
        const photo = await prepareSampleShot(files[i]);
        const res = await apiPostJson("/api/catalog?action=shots", {
          cameraId,
          caption,
          ...photo,
        });
        posted.push({ ...res.shot, thumb: photo.thumb });
      }
      setCaption("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setPostError(err.message);
    } finally {
      if (posted.length) setShots((prev) => [...posted.reverse(), ...prev]);
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
    if (!window.confirm("Delete this sample shot? It will disappear from the website.")) return;
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
            Photos taken with each camera. Each post shows in that camera&apos;s folder in the
            website&apos;s Gallery, with your caption — like a Facebook post.
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
                onChange={(e) => setFiles([...e.target.files])}
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
                Choose one or more. Several photos become separate posts with the same caption.
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
                {posting ? `Posting ${posting}` : "Post"}
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
              {s.thumb && <img src={s.thumb} alt="" className="aspect-[4/3] w-full object-cover" />}
              <div className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold">{s.cameraName}</span>
                  <span className="text-xs text-[color:var(--color-dark-gray)]">{formatDate(s.createdAt)}</span>
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
