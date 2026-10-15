import { useEffect, useMemo, useRef, useState } from "react";
import { useCameras } from "../hooks/useCameras.js";
import { distributeToUnits, expandInclusiveDateRange, formatISODateLocal } from "../utils/dateHelpers.js";

const WIDTH = 1080;
const HEIGHT = 1780;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const EXCLUDED_STATUSES = new Set(["cancelled", "rejected"]);
const CAMERA_IMAGE_PATHS = {
  "dji osmo 360": "/cameras/dji-osmo-360.png",
  "dji osmo pocket 3": "/cameras/dji-osmo-pocket-3.png",
  "dji osmo nano": "/cameras/dji-osmo-nano.png",
  "insta360 ace pro 2": "/cameras/insta360-ace-pro-2.png",
  "canon g7x mark iii": "/cameras/canon-g7x-mark-iii.png",
  "fujifilm x-t100": "/cameras/fujifilm-x-t100.png",
};

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function cameraMatches(booking, camera) {
  return (booking.PREFERRED_CAMERA || "").trim().toLowerCase() === camera.name.trim().toLowerCase();
}

export function buildAvailability(cameras, bookings, month) {
  const key = monthKey(month);
  return cameras.flatMap((camera) => {
    const cameraBookings = bookings
      .filter((booking) => !EXCLUDED_STATUSES.has((booking.status || "").toLowerCase()))
      .filter((booking) => cameraMatches(booking, camera));
    const unitSlots = distributeToUnits(cameraBookings, camera.units).slice(0, camera.units);
    return unitSlots.map((unitBookings, unitIndex) => {
      const occupied = new Map();
      unitBookings.forEach((booking) => {
        expandInclusiveDateRange(booking.PICK_UP_DATE, booking.RETURN_DATE).forEach((iso) => {
          if (iso.startsWith(key)) occupied.set(iso, (occupied.get(iso) || 0) + 1);
        });
      });
      return { ...camera, units: 1, unitLabel: `UNIT ${unitIndex + 1}`, occupied };
    });
  });
}

function roundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function fitText(ctx, value, maxWidth, startingSize, weight = 700) {
  let size = startingSize;
  do {
    ctx.font = `${weight} ${size}px Poppins, Arial, sans-serif`;
    if (ctx.measureText(value).width <= maxWidth) return size;
    size -= 2;
  } while (size > 20);
  return size;
}

function removeLogoBackground(image) {
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  const sourceContext = source.getContext("2d");
  sourceContext.drawImage(image, 0, 0);
  const imageData = sourceContext.getImageData(0, 0, source.width, source.height);
  const pixels = imageData.data;
  let minX = source.width;
  let minY = source.height;
  let maxX = 0;
  let maxY = 0;
  let foundInk = false;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
    const alpha = luminance <= 82 ? 255 : luminance >= 138 ? 0 : Math.round((255 * (138 - luminance)) / 56);
    pixels[index] = 0;
    pixels[index + 1] = 0;
    pixels[index + 2] = 0;
    pixels[index + 3] = Math.min(pixels[index + 3], alpha);
    if (pixels[index + 3] > 24) {
      foundInk = true;
      const pixel = index / 4;
      const px = pixel % source.width;
      const py = Math.floor(pixel / source.width);
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }
  sourceContext.putImageData(imageData, 0, 0);
  if (!foundInk) return source;
  const padding = 8;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(source.width - 1, maxX + padding);
  maxY = Math.min(source.height - 1, maxY + padding);
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  output.getContext("2d").drawImage(source, minX, minY, width, height, 0, 0, width, height);
  return output;
}

function removeGreenBackground(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const keyStrength = green - Math.max(red, blue);
    if (green > 100 && keyStrength > 30) pixels[index + 3] = Math.max(0, 255 - keyStrength * 4);
    if (pixels[index + 3] > 24) {
      const pixel = index / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  context.putImageData(imageData, 0, 0);
  const padding = 8;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(canvas.width - 1, maxX + padding);
  maxY = Math.min(canvas.height - 1, maxY + padding);
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  output.getContext("2d").drawImage(canvas, minX, minY, width, height, 0, 0, width, height);
  return output;
}

function drawContainedImage(ctx, image, x, y, width, height) {
  if (!image) return;
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawMiniCalendar(ctx, camera, month, x, y, width, height, cameraImage) {
  ctx.save();
  const compact = height < 250;
  roundedRect(ctx, x, y, width, height, compact ? 14 : 22);
  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(24,24,24,.12)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#171717";
  ctx.textAlign = "center";
  const imageSize = compact ? 56 : 68;
  drawContainedImage(ctx, cameraImage, x + width - imageSize - 3, y + (compact ? -7 : -9), imageSize, imageSize);
  const cameraFont = fitText(ctx, camera.name.toUpperCase(), width - imageSize - (compact ? 28 : 52), compact ? 14 : 22, 800);
  ctx.font = `800 ${cameraFont}px Montserrat, Arial, sans-serif`;
  ctx.fillText(camera.name.toUpperCase(), x + (width - imageSize) / 2, y + (compact ? 23 : 38));
  ctx.fillStyle = "#78716c";
  ctx.font = `600 ${compact ? 9 : 13}px Poppins, Arial, sans-serif`;
  ctx.fillText(camera.unitLabel || `${camera.units} ${camera.units === 1 ? "UNIT" : "UNITS"}`, x + (width - imageSize) / 2, y + (compact ? 39 : 59));

  const sidePadding = compact ? 12 : 22;
  const gridX = x + sidePadding;
  const gridY = y + (compact ? 59 : 86);
  const cellW = (width - sidePadding * 2) / 7;
  const cellH = (height - (compact ? 76 : 112)) / 6;
  ctx.textAlign = "center";
  ctx.font = `700 ${compact ? 9 : 13}px Montserrat, Arial, sans-serif`;
  ctx.fillStyle = "#78716c";
  WEEKDAYS.forEach((day, index) => ctx.fillText(day, gridX + cellW * (index + 0.5), gridY));

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= days; day += 1) {
    const index = firstDay + day - 1;
    const col = index % 7;
    const row = Math.floor(index / 7);
    const cx = gridX + cellW * (col + 0.5);
    const cy = gridY + (compact ? 11 : 19) + cellH * (row + 0.5);
    const iso = formatISODateLocal(new Date(year, monthIndex, day));
    const used = camera.occupied.get(iso) || 0;
    const booked = used >= camera.units;
    if (booked && cameraImage) {
      const markerSize = compact ? 21 : 29;
      drawContainedImage(ctx, cameraImage, cx - markerSize / 2, cy - markerSize / 2, markerSize, markerSize);
    } else {
      ctx.fillStyle = "#171717";
      ctx.font = `600 ${compact ? 8 : 11}px Poppins, Arial, sans-serif`;
      ctx.fillText(String(day), cx, cy + (compact ? 3 : 4));
    }
  }
  ctx.restore();
}

function drawStory(canvas, cameras, month, logo, cameraImages) {
  const ctx = canvas.getContext("2d");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  ctx.fillStyle = "#eceae5";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#171717";
  ctx.textAlign = "center";
  ctx.font = "800 40px Montserrat, Arial, sans-serif";
  ctx.fillText("CAPTURE EVERY MOMENT", WIDTH / 2, 122);
  ctx.font = "400 19px Poppins, Arial, sans-serif";
  ctx.fillStyle = "#78716c";
  ctx.fillText("Plenty of dates are still open — reserve yours early.", WIDTH / 2, 162);

  roundedRect(ctx, 44, 230, 992, 1475, 42);
  ctx.fillStyle = "#eceae5";
  ctx.fill();
  for (let index = 0; index < 2100; index += 1) {
    const px = 55 + ((index * 73) % 970);
    const py = 245 + ((index * 151) % 1440);
    ctx.fillStyle = index % 3 ? "rgba(40,36,31,.022)" : "rgba(255,255,255,.12)";
    ctx.fillRect(px, py, 2, 2);
  }

  if (logo) {
    const logoWidth = 285;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    ctx.drawImage(logo, (WIDTH - logoWidth) / 2, 210, logoWidth, logoHeight);
  }
  ctx.fillStyle = "#171717";
  ctx.font = "800 60px Montserrat, Arial, sans-serif";
  ctx.fillText(`${month.toLocaleDateString("en-US", { month: "long" })} Calendar`, WIDTH / 2, 455);
  ctx.font = "600 17px Poppins, Arial, sans-serif";
  ctx.fillStyle = "#78716c";
  ctx.fillText(`${month.getFullYear()}  •  UNIT AVAILABILITY`, WIDTH / 2, 487);

  const columns = 3;
  const gapX = 14;
  const gapY = 14;
  const cardWidth = 290;
  const cardHeight = 194;
  const startX = 91;
  const startY = 520;
  const finalRowCount = cameras.length % columns || columns;
  const finalRowIndex = Math.floor((cameras.length - 1) / columns);
  const finalRowOffset = ((columns - finalRowCount) * (cardWidth + gapX)) / 2;
  cameras.forEach((camera, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const centeredOffset = row === finalRowIndex ? finalRowOffset : 0;
    const cameraImage = cameraImages?.[(camera.name || "").toLowerCase()];
    drawMiniCalendar(ctx, camera, month, startX + centeredOffset + col * (cardWidth + gapX), startY + row * (cardHeight + gapY), cardWidth, cardHeight, cameraImage);
  });

  ctx.beginPath();
  ctx.moveTo(125, 1570);
  ctx.lineTo(955, 1570);
  ctx.strokeStyle = "#aaa69f";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = "600 16px Poppins, Arial, sans-serif";
  ctx.fillStyle = "#5f5b55";
  ctx.fillText("BULACAN / MANILA / LAGUNA  •  0912 016 1865", WIDTH / 2, 1608);

  ctx.fillStyle = "#171717";
  ctx.font = "600 31px Poppins, Arial, sans-serif";
  ctx.fillText("MESSAGE US NOW TO LOCK IN YOUR DATES", WIDTH / 2, 1715);
}

export default function StoryCalendar({ viewMonth, bookings, loading = false, onClose }) {
  const canvasRef = useRef(null);
  const logoRef = useRef(null);
  const cameraImagesRef = useRef({});
  const [downloadStatus, setDownloadStatus] = useState("");
  const [assetsReady, setAssetsReady] = useState(false);
  const { cameras } = useCameras();
  const availability = useMemo(() => buildAvailability(cameras, bookings, viewMonth), [cameras, bookings, viewMonth]);

  useEffect(() => {
    let cancelled = false;
    const logo = new Image();
    const loadCameraImages = Promise.all(
      Object.entries(CAMERA_IMAGE_PATHS).map(([name, path]) => new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve([name, removeGreenBackground(image)]);
        image.onerror = () => resolve([name, null]);
        image.src = path;
      })),
    );
    logo.onload = async () => {
      const transparentLogo = removeLogoBackground(logo);
      const cameraImages = Object.fromEntries(await loadCameraImages);
      if (cancelled) return;
      logoRef.current = transparentLogo;
      cameraImagesRef.current = cameraImages;
      setAssetsReady(true);
    };
    logo.src = "/logo.png";
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawStory(canvasRef.current, availability, viewMonth, logoRef.current, cameraImagesRef.current);
  }, [availability, viewMonth, assetsReady]);

  async function downloadStory() {
    setDownloadStatus("Preparing PNG…");
    const fileName = `snr-availability-${monthKey(viewMonth)}.png`;
    try {
      const blob = await new Promise((resolve, reject) => {
        canvasRef.current.toBlob(
          (output) => (output ? resolve(output) : reject(new Error("Unable to create PNG."))),
          "image/png",
        );
      });
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "S&R Rentals Availability",
        });
        setDownloadStatus("Choose Save Image or Save to Files.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDownloadStatus("PNG downloaded.");
    } catch (error) {
      if (error?.name === "AbortError") {
        setDownloadStatus("");
        return;
      }
      setDownloadStatus("Download failed. Please try again.");
    }
  }

  return (
    <div className="ui-overlay items-start overflow-y-auto" role="dialog" aria-modal="true" aria-label="Download availability calendar">
      <div className="ui-modal mx-auto max-w-xl p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[color:var(--color-black)]">Download Calendar</h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-dark-gray)]">{viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })} • {WIDTH} × {HEIGHT}</p>
          </div>
          <button type="button" onClick={onClose} className="ui-btn ui-btn--sm">CLOSE</button>
        </div>
        <div className="mx-auto max-w-[390px] overflow-hidden rounded-[22px] border-[6px] border-[color:var(--color-ink)] bg-[color:var(--color-black)] shadow-xl">
          <canvas ref={canvasRef} aria-label="Generated camera availability story preview" className="block h-auto w-full bg-[rgba(255,255,255,0.5)]" />
        </div>
        <button type="button" disabled={loading || !assetsReady} onClick={downloadStory} className="mt-4 w-full bg-[color:var(--color-black)] px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-black disabled:opacity-50">
          {loading || !assetsReady ? "Preparing calendar…" : "Download Story PNG"}
        </button>
        {downloadStatus && <p className="mt-2 text-center font-mono text-[10px] text-[color:var(--color-dark-gray)]">{downloadStatus}</p>}
        <p className="mt-2 text-center font-mono text-[10px] text-[color:var(--color-dark-gray)]">{availability.length} physical units • uses the month shown on Schedule</p>
      </div>
    </div>
  );
}
