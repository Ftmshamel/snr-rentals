export function isDataDocument(ref) {
  return /^data:/i.test(String(ref || ""));
}

export function isUrlDocument(ref) {
  return /^https?:\/\//i.test(String(ref || ""));
}

export function isImageDocument(ref) {
  const value = String(ref || "");
  return (
    /^data:image\//i.test(value) ||
    /^blob:/i.test(value) ||
    /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(value)
  );
}

function googleDriveId(ref) {
  const value = String(ref || "").trim();
  if (!value) return "";

  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /uc\?export=[^&]+&id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }

  return /^[a-zA-Z0-9_-]{20,}$/.test(value) ? value : "";
}

export function documentThumb(ref, width = 400) {
  const value = String(ref || "").trim();
  if (!value) return "";
  if (isDataDocument(value) || isUrlDocument(value) || /^blob:/i.test(value)) {
    return value;
  }

  const id = googleDriveId(value) || value;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
    id,
  )}&sz=w${width}`;
}

export function documentView(ref) {
  const value = String(ref || "").trim();
  if (!value) return "";
  if (isDataDocument(value) || isUrlDocument(value) || /^blob:/i.test(value)) {
    return value;
  }

  const id = googleDriveId(value) || value;
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

export function documentOpenLabel(ref) {
  return isDataDocument(ref) ? "Open uploaded file" : "Open in Google Drive";
}
