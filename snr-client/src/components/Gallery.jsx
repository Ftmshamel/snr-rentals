import { useEffect, useMemo, useRef, useState } from "react";
import { apiGetJson } from "../utils/api.js";
import { useCatalog } from "../data/catalog.js";
import useReveal from "../hooks/useReveal.js";
import Icon from "./Icon.jsx";

// Sample shots, one folder per camera. Opening a folder shows its photos as
// posts (S&R Rentals · Shot on <camera> · date, caption, photo) — the way
// they'd look on the Facebook page. Posted from the admin's Gallery page;
// API: /api/catalog?action=shots (thumbnails) and ?action=shot&id= (full).

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Swaps the thumbnail for the full photo once the post scrolls into view.
function PostPhoto({ shot }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(shot.thumb);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || full) return undefined;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        apiGetJson(`/api/catalog?action=shot&id=${encodeURIComponent(shot.id)}`)
          .then((d) => {
            if (!cancelled && d.shot?.image) {
              setSrc(d.shot.image);
              setFull(true);
            }
          })
          .catch(() => {});
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [shot.id, full]);

  const ratio = shot.width && shot.height ? `${shot.width} / ${shot.height}` : "4 / 3";
  return (
    <img
      ref={ref}
      src={src}
      alt={shot.caption || `Sample shot from ${shot.cameraName}`}
      className={`post__photo ${full ? "" : "is-loading"}`}
      style={{ aspectRatio: ratio }}
    />
  );
}

function Post({ shot }) {
  return (
    <article className="post">
      <header className="post__head">
        <span className="post__avatar" aria-hidden="true">
          <img src="/logo.png" alt="" />
        </span>
        <div>
          <div className="post__author">S&amp;R Rentals</div>
          <div className="post__meta">
            Shot on <strong>{shot.cameraName}</strong> · {formatDate(shot.createdAt)}
          </div>
        </div>
      </header>
      {shot.caption && <p className="post__caption">{shot.caption}</p>}
      <PostPhoto shot={shot} />
    </article>
  );
}

function Folder({ folder, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="folder-view" role="dialog" aria-modal="true" aria-label={`${folder.name} sample shots`} onClick={onClose}>
      <div className="folder-view__panel" onClick={(e) => e.stopPropagation()}>
        <div className="folder-view__bar">
          <div>
            <div className="folder-view__kicker">Sample shots</div>
            <h3 className="folder-view__title">{folder.name}</h3>
          </div>
          <button type="button" className="folder-view__close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="folder-view__feed">
          {folder.shots.map((s) => <Post key={s.id} shot={s} />)}
          <a href={`/book?camera=${encodeURIComponent(folder.name)}`} className="btn btn--solid folder-view__book">
            Book the {folder.name} <Icon name="arrow-right" size={16} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Gallery() {
  const ref = useReveal();
  const { cameras } = useCatalog();
  const [shots, setShots] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    apiGetJson("/api/catalog?action=shots")
      .then((d) => setShots(Array.isArray(d.shots) ? d.shots : []))
      .catch(() => setShots([]));
  }, []);

  // Folders follow the lineup's order; cameras without photos are left out.
  const folders = useMemo(() => {
    if (!shots) return [];
    const byCam = {};
    shots.forEach((s) => (byCam[s.cameraId] ||= []).push(s));
    const ordered = cameras
      .filter((c) => byCam[c.id])
      .map((c) => ({ id: c.id, name: c.name, shots: byCam[c.id] }));
    // Shots of a camera no longer in the lineup still get a folder.
    Object.keys(byCam)
      .filter((id) => !cameras.some((c) => c.id === id))
      .forEach((id) => ordered.push({ id, name: byCam[id][0].cameraName, shots: byCam[id] }));
    return ordered;
  }, [shots, cameras]);

  // #gallery/<cameraId> opens that folder, so a camera's sample shots can be
  // shared as a link (e.g. on Facebook or Messenger).
  useEffect(() => {
    const fromHash = () => {
      const m = window.location.hash.match(/^#gallery\/(.+)$/);
      setOpenId(m ? decodeURIComponent(m[1]) : null);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function openFolder(id) {
    window.history.pushState(null, "", `#gallery/${encodeURIComponent(id)}`);
    setOpenId(id);
  }

  // After a shared link opens a folder straight away, closing it lands on
  // the Gallery section rather than the top of the page.
  function closeFolder() {
    window.history.pushState(null, "", "#gallery");
    setOpenId(null);
    requestAnimationFrame(() => document.getElementById("gallery")?.scrollIntoView({ block: "start" }));
  }

  const open = folders.find((f) => f.id === openId);

  return (
    <section id="gallery" className="section" ref={ref}>
      <div className="section__head reveal">
        <p className="section__kicker">Gallery</p>
        <h2 className="section__title">Sample Shots</h2>
        <p className="section__lede">
          Real photos taken with our units. Open a camera&apos;s folder to see what it can do.
        </p>
      </div>

      {shots === null ? (
        <div className="gallery-grid" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="gallery-folder is-skeleton" />)}
        </div>
      ) : folders.length === 0 ? (
        <p className="gallery-empty">
          Sample shots are coming soon. Meanwhile, see our latest photos on Facebook.
        </p>
      ) : (
        <div className="gallery-grid">
          {folders.map((f) => (
            <button key={f.id} type="button" className="gallery-folder" onClick={() => openFolder(f.id)}>
              <span className={`gallery-folder__cover n${Math.min(f.shots.length, 3)}`}>
                {f.shots.slice(0, 3).map((s) => (
                  <img key={s.id} src={s.thumb} alt="" loading="lazy" />
                ))}
              </span>
              <span className="gallery-folder__label">
                <span className="gallery-folder__name">{f.name}</span>
                <span className="gallery-folder__count">
                  {f.shots.length} photo{f.shots.length === 1 ? "" : "s"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && <Folder folder={open} onClose={closeFolder} />}
    </section>
  );
}
