import { useEffect, useMemo, useRef, useState } from "react";
import { apiGetJson } from "../utils/api.js";
import { useCatalog } from "../data/catalog.js";
import useReveal from "../hooks/useReveal.js";
import Icon from "./Icon.jsx";

// Sample shots, one folder per camera. Opening a folder shows its posts the
// way they'd look on the Facebook page: S&R Rentals · Shot on <camera> ·
// date, the caption, then the post's 1–10 photos as a grid. Tapping a photo
// opens a viewer with next/previous. Posted from the admin's Gallery page.
// API: /api/catalog?action=shots (posts, thumbnails only) and
// ?action=shot&id=<post>&photo=<photo> (one full-size photo).

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Full-size photos are fetched once and shared by the grid and the viewer.
const fullPhotos = new Map();
function loadFullPhoto(postId, photoId) {
  const key = `${postId}/${photoId}`;
  if (!fullPhotos.has(key)) {
    const p = apiGetJson(
      `/api/catalog?action=shot&id=${encodeURIComponent(postId)}&photo=${encodeURIComponent(photoId)}`,
    )
      .then((d) => d.photo?.image || null)
      .catch(() => {
        fullPhotos.delete(key); // allow a retry later
        return null;
      });
    fullPhotos.set(key, p);
  }
  return fullPhotos.get(key);
}

/** The thumbnail first, then the full photo once `enabled`. */
function useFullPhoto(postId, photo, enabled) {
  const [src, setSrc] = useState(photo.thumb);
  const [full, setFull] = useState(false);
  useEffect(() => {
    setSrc(photo.thumb);
    setFull(false);
  }, [postId, photo.id, photo.thumb]);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    loadFullPhoto(postId, photo.id).then((image) => {
      if (!cancelled && image) {
        setSrc(image);
        setFull(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [postId, photo.id, enabled]);
  return { src, full };
}

// True once the element has scrolled near the viewport.
function useNearViewport(ref) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near]);
  return near;
}

// One photo of a post's grid. A post with a single photo shows it at its own
// shape and loads it full size; grid cells keep the (400px) thumbnail.
function GridPhoto({ post, photo, single, onOpen, extra }) {
  const ref = useRef(null);
  const near = useNearViewport(ref);
  const { src, full } = useFullPhoto(post.id, photo, single && near);
  const ratio = single && photo.width && photo.height ? `${photo.width} / ${photo.height}` : undefined;
  return (
    <button type="button" ref={ref} className="post-grid__cell" onClick={onOpen} aria-label="View photo">
      <img
        src={src}
        alt=""
        className={single && !full ? "is-loading" : ""}
        style={ratio ? { aspectRatio: ratio } : undefined}
      />
      {extra > 0 && <span className="post-grid__more">+{extra}</span>}
    </button>
  );
}

function PhotoGrid({ post, onOpen }) {
  const photos = post.photos || [];
  if (photos.length === 0) return null;
  const shown = photos.slice(0, 4);
  const extra = photos.length - shown.length;
  return (
    <div className={`post-grid n${Math.min(photos.length, 4)}`}>
      {shown.map((p, i) => (
        <GridPhoto
          key={p.id}
          post={post}
          photo={p}
          single={photos.length === 1}
          onOpen={() => onOpen(i)}
          extra={i === shown.length - 1 ? extra : 0}
        />
      ))}
    </div>
  );
}

function Post({ post, onOpen }) {
  return (
    <article className="post">
      <header className="post__head">
        <span className="post__avatar" aria-hidden="true">
          <img src="/logo.png" alt="" />
        </span>
        <div>
          <div className="post__author">S&amp;R Rentals</div>
          <div className="post__meta">
            Shot on <strong>{post.cameraName}</strong> · {formatDate(post.createdAt)}
          </div>
        </div>
      </header>
      {post.caption && <p className="post__caption">{post.caption}</p>}
      <PhotoGrid post={post} onOpen={(i) => onOpen(post, i)} />
    </article>
  );
}

// Full-screen photo viewer: arrows / swipe / keyboard to move, Esc to close.
function Viewer({ post, index, onIndex, onClose }) {
  const photos = post.photos;
  const photo = photos[index];
  const { src, full } = useFullPhoto(post.id, photo, true);
  const touch = useRef(null);
  const many = photos.length > 1;
  const go = (d) => onIndex((index + d + photos.length) % photos.length);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (many && e.key === "ArrowRight") go(1);
      else if (many && e.key === "ArrowLeft") go(-1);
      else return;
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });

  // Preload the neighbours so moving through the album feels instant.
  useEffect(() => {
    if (!many) return;
    loadFullPhoto(post.id, photos[(index + 1) % photos.length].id);
    loadFullPhoto(post.id, photos[(index - 1 + photos.length) % photos.length].id);
  }, [post.id, index, many, photos]);

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (!many || touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <div className="viewer__top" onClick={(e) => e.stopPropagation()}>
        <span>{many ? `${index + 1} / ${photos.length}` : post.cameraName}</span>
        <button type="button" className="viewer__btn" onClick={onClose} aria-label="Close">
          <Icon name="x" size={20} />
        </button>
      </div>
      <img
        src={src}
        alt={post.caption || `Sample shot from ${post.cameraName}`}
        className={`viewer__img ${full ? "" : "is-loading"}`}
        onClick={(e) => e.stopPropagation()}
      />
      {many && (
        <>
          <button type="button" className="viewer__btn viewer__prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous photo">
            <Icon name="arrow-left" size={20} />
          </button>
          <button type="button" className="viewer__btn viewer__next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next photo">
            <Icon name="arrow-right" size={20} />
          </button>
        </>
      )}
      {post.caption && (
        <p className="viewer__caption" onClick={(e) => e.stopPropagation()}>
          <strong>Shot on {post.cameraName}</strong> · {post.caption}
        </p>
      )}
    </div>
  );
}

function Folder({ folder, onClose }) {
  const [viewing, setViewing] = useState(null); // { post, index }

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
          {folder.posts.map((p) => (
            <Post key={p.id} post={p} onOpen={(post, index) => setViewing({ post, index })} />
          ))}
          <a href={`/book?camera=${encodeURIComponent(folder.name)}`} className="btn btn--solid folder-view__book">
            Book the {folder.name} <Icon name="arrow-right" size={16} />
          </a>
        </div>
      </div>
      {viewing && (
        <Viewer
          post={viewing.post}
          index={viewing.index}
          onIndex={(index) => setViewing((v) => ({ ...v, index }))}
          onClose={() => setViewing(null)}
        />
      )}
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
    const folder = (id, name) => ({
      id,
      name,
      posts: byCam[id],
      photos: byCam[id].flatMap((p) => p.photos || []),
    });
    const ordered = cameras.filter((c) => byCam[c.id]).map((c) => folder(c.id, c.name));
    // Posts of a camera no longer in the lineup still get a folder.
    Object.keys(byCam)
      .filter((id) => !cameras.some((c) => c.id === id))
      .forEach((id) => ordered.push(folder(id, byCam[id][0].cameraName)));
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
              <span className={`gallery-folder__cover n${Math.min(f.photos.length, 3)}`}>
                {f.photos.slice(0, 3).map((p, i) => (
                  <img key={i} src={p.thumb} alt="" loading="lazy" />
                ))}
              </span>
              <span className="gallery-folder__label">
                <span className="gallery-folder__name">{f.name}</span>
                <span className="gallery-folder__count">
                  {f.photos.length} photo{f.photos.length === 1 ? "" : "s"}
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
