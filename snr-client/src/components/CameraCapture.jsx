import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import useLockBodyScroll from "../hooks/useLockBodyScroll.js";

// Requirement photos (IDs, proof of billing, selfie) are taken with the
// device camera on the page itself — there is no file upload — and every
// photo is stamped with the date/time and an S&R-only watermark before it
// leaves the browser. See stampForSnr() below.

const MAX_EDGE = 1600;
const QUALITY = 0.82;

const manilaStamp = (date) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date) + " PHT";

/**
 * Draws the S&R watermark onto a canvas in place: a repeated diagonal
 * "FOR S&R RENTALS USE ONLY" across the whole image and a footer band with
 * the label and the capture date/time (Manila).
 */
export function stampForSnr(canvas, { label = "", when = new Date(), source = "Captured" } = {}) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const unit = Math.max(w, h) / 1000;

  // Diagonal tiled text
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const size = Math.round(28 * unit);
  ctx.font = `700 ${size}px Poppins, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = "FOR S&R RENTALS USE ONLY";
  const stepX = ctx.measureText(text).width + size * 2.5;
  const stepY = size * 4.2;
  const span = Math.hypot(w, h);
  for (let y = -span; y <= span; y += stepY) {
    const offset = (Math.round(y / stepY) % 2) * (stepX / 2);
    for (let x = -span; x <= span; x += stepX) {
      ctx.lineWidth = Math.max(1, size / 14);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
      ctx.strokeText(text, x + offset, y);
      ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
      ctx.fillText(text, x + offset, y);
    }
  }
  ctx.restore();

  // Footer band
  const band = Math.round(46 * unit);
  ctx.fillStyle = "rgba(10, 10, 10, 0.72)";
  ctx.fillRect(0, h - band, w, band);
  const small = Math.round(16 * unit);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${small}px Poppins, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`S&R Rentals · For S&R use only${label ? ` · ${label}` : ""}`, small, h - band / 2);
  ctx.font = `500 ${small}px Poppins, Arial, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(`${source} ${manilaStamp(when)}`, w - small, h - band / 2);
}

/** Copies any drawable (video frame, image) onto a canvas no larger than MAX_EDGE. */
function toCanvas(source, srcW, srcH) {
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cameraError(err) {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "The camera only works on the secure (https) site.";
  }
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. Allow the camera for this site in your browser settings, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. Open this page on your phone to take the photo.";
    case "NotReadableError":
      return "The camera is being used by another app. Close it and try again.";
    default:
      return "The camera couldn't start. Try again, or open this page on your phone.";
  }
}

export default function CameraCapture({ label, facing = "environment", onCapture, onClose }) {
  useLockBodyScroll();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facingMode, setFacingMode] = useState(facing);
  const [status, setStatus] = useState("starting"); // starting | live | error | review
  const [error, setError] = useState("");
  const [shot, setShot] = useState("");
  const [session, setSession] = useState(0); // bump to (re)start the camera

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setStatus("starting");
      setError("");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          const e = new Error("unsupported");
          e.name = window.isSecureContext ? "NotFoundError" : "SecurityError";
          throw e;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setStatus("live");
      } catch (err) {
        if (!cancelled) {
          setError(cameraError(err));
          setStatus("error");
        }
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facingMode, session]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = toCanvas(video, video.videoWidth, video.videoHeight);
    stampForSnr(canvas, { label });
    setShot(canvas.toDataURL("image/jpeg", QUALITY));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus("review");
  }

  return createPortal(
    <div className="cam-backdrop" role="dialog" aria-modal="true" aria-label={`Take photo: ${label}`}>
      <div className="cam">
        <div className="cam__bar">
          <div>
            <strong>{label}</strong>
            <span>Photo is stamped with the date, time and an S&amp;R-only watermark.</span>
          </div>
          <button type="button" className="cam__close" aria-label="Close camera" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="cam__stage">
          {status === "review" ? (
            <img src={shot} alt={`${label} photo`} className="cam__shot" />
          ) : (
            <video
              ref={videoRef}
              className={`cam__video ${facingMode === "user" ? "is-mirrored" : ""}`}
              playsInline
              muted
              autoPlay
            />
          )}
          {status === "starting" && <p className="cam__msg">Starting camera…</p>}
          {status === "error" && (
            <div className="cam__msg cam__msg--error">
              <Icon name="info" size={20} />
              <p>{error}</p>
              <button type="button" className="btn btn--solid btn--sm" onClick={() => setSession((n) => n + 1)}>
                Try again
              </button>
            </div>
          )}
        </div>

        <div className="cam__actions">
          {status === "review" ? (
            <>
              <button type="button" className="btn btn--outline" onClick={() => { setShot(""); setSession((n) => n + 1); }}>
                <Icon name="reset" size={16} /> Retake
              </button>
              <button type="button" className="btn btn--solid" onClick={() => onCapture(shot)}>
                <Icon name="check" size={16} /> Use photo
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--outline"
                disabled={status !== "live"}
                onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}
              >
                <Icon name="arrows-h" size={16} /> Switch camera
              </button>
              <button type="button" className="btn btn--solid cam__shutter" disabled={status !== "live"} onClick={capture}>
                <Icon name="camera" size={18} /> Take photo
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
