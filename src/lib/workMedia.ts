/** Shared image/video helpers for Work files, Support mail, and feature requests. */

export const WORK_VIDEO_POSTER_PREFIX = "thumb__";

export function isImageMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

export function isVideoMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("video/");
}

/** True if MIME or file name looks like a video (clipboard often omits type). */
export function isVideoFile(file: File): boolean {
  if (isVideoMime(file.type)) return true;
  return /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
}

export function isImageFile(file: File): boolean {
  if (isImageMime(file.type)) return true;
  return /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name);
}

export function isWorkMediaMime(mimeType: string): boolean {
  return isImageMime(mimeType) || isVideoMime(mimeType);
}

/** Detect MP4/QuickTime (`ftyp`) or WebM from the first bytes. */
export async function sniffIsVideoFile(file: File): Promise<boolean> {
  if (isVideoFile(file)) return true;
  if (isImageFile(file)) return false;
  try {
    const buf = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    if (buf.length >= 8) {
      // ISO BMFF: size(4) + 'ftyp'
      if (
        buf[4] === 0x66 &&
        buf[5] === 0x74 &&
        buf[6] === 0x79 &&
        buf[7] === 0x70
      ) {
        return true;
      }
    }
    // WebM / Matroska EBML header
    if (
      buf.length >= 4 &&
      buf[0] === 0x1a &&
      buf[1] === 0x45 &&
      buf[2] === 0xdf &&
      buf[3] === 0xa3
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function guessMediaMime(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (isVideoFile(file)) return "video/mp4";
  return file.type || "application/octet-stream";
}

/** Guess MIME from name or magic bytes (server-safe). */
export function guessMimeFromNameAndBytes(
  fileName: string,
  bytes: Uint8Array,
  declaredType?: string
): string {
  const declared = (declaredType || "").toLowerCase();
  if (
    declared &&
    declared !== "application/octet-stream" &&
    declared !== "binary/octet-stream"
  ) {
    return declaredType!;
  }
  const name = fileName.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (bytes.length >= 8) {
    if (
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    ) {
      return "video/mp4";
    }
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  return declared || "application/octet-stream";
}

/** Collect candidate clipboard files (any file item). Caller may sniff videos. */
export function collectClipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seen = new Set<string>();
  const add = (file: File) => {
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(file);
  };
  if (data.items?.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file) add(file);
    }
  }
  if (data.files?.length) {
    for (const file of Array.from(data.files)) add(file);
  }
  return out;
}

/** Collect image/video files from a paste/drop DataTransfer (items + files). */
export function collectClipboardMediaFiles(data: DataTransfer | null): File[] {
  return collectClipboardFiles(data).filter(
    (file) => isImageFile(file) || isVideoFile(file)
  );
}

/** Async: also keep unnamed blobs that sniff as MP4/WebM (Snipping Tool paste). */
export async function collectClipboardMediaFilesAsync(
  data: DataTransfer | null
): Promise<File[]> {
  const files = collectClipboardFiles(data);
  const out: File[] = [];
  for (const file of files) {
    if (isImageFile(file) || isVideoFile(file) || (await sniffIsVideoFile(file))) {
      out.push(file);
    }
  }
  return out;
}

export function withGuessedMediaType(file: File, index = 0): File {
  const type = guessMediaMime(file);
  const name = pasteMediaFileName(
    file.type ? file : new File([file], file.name || "blob", { type }),
    index
  );
  if (file.type === type && file.name === name) return file;
  return new File([file], name, { type });
}

export async function withSniffedMediaType(
  file: File,
  index = 0
): Promise<File> {
  if (await sniffIsVideoFile(file)) {
    const type =
      file.type && isVideoMime(file.type) ? file.type : guessMediaMime(file);
    const forcedType =
      type.startsWith("video/") && type !== "application/octet-stream"
        ? type
        : "video/mp4";
    const named = pasteMediaFileName(
      new File([file], file.name || "video.mp4", { type: forcedType }),
      index
    );
    const finalName = /\.(mp4|webm|mov|m4v|mkv)$/i.test(named)
      ? named
      : named.includes(".")
        ? named.replace(/\.[^.]+$/, ".mp4")
        : `${named}.mp4`;
    return new File([file], finalName, { type: forcedType });
  }
  return withGuessedMediaType(file, index);
}

export function isVideoPosterFileName(fileName: string): boolean {
  return fileName.toLowerCase().startsWith(WORK_VIDEO_POSTER_PREFIX);
}

/** Poster file name for a video attachment (`thumb__clip.mp4.jpg`). */
export function videoPosterFileName(videoFileName: string): string {
  const cleaned = videoFileName.trim() || "video.mp4";
  return `${WORK_VIDEO_POSTER_PREFIX}${cleaned}.jpg`;
}

export function pasteMediaFileName(file: File, index: number): string {
  const type = file.type.toLowerCase();
  const ext =
    type === "image/png"
      ? "png"
      : type === "image/jpeg"
        ? "jpg"
        : type === "image/gif"
          ? "gif"
          : type === "image/webp"
            ? "webp"
            : type === "video/mp4"
              ? "mp4"
              : type === "video/webm"
                ? "webm"
                : type === "video/quicktime"
                  ? "mov"
                  : file.name.includes(".")
                    ? file.name.split(".").pop()!
                    : isVideoMime(type)
                      ? "mp4"
                      : "png";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const looksGeneric =
    !file.name ||
    file.name.startsWith("image") ||
    file.name.startsWith("video") ||
    file.name === "blob";
  const safeExt =
    ext ||
    (isVideoMime(type) || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name)
      ? "mp4"
      : "png");
  return looksGeneric
    ? `paste-${stamp}${index > 0 ? `-${index + 1}` : ""}.${safeExt}`
    : file.name;
}

/** Dark placeholder with a play glyph when frame capture fails. */
export function createFallbackVideoPosterJpeg(): Promise<Blob | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(320, 240, 48, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(308, 212);
  ctx.lineTo(308, 268);
  ctx.lineTo(352, 240);
  ctx.closePath();
  ctx.fillStyle = "#1c1c1c";
  ctx.fill();
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
  });
}

/**
 * Grab the first decoded frame of a video as a JPEG blob (for thumbnails).
 * Returns null if the browser cannot decode the file.
 */
export function extractVideoPosterJpeg(
  file: File,
  options?: { maxWidth?: number; quality?: number }
): Promise<Blob | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  const maxWidth = options?.maxWidth ?? 640;
  const quality = options?.quality ?? 0.82;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.src = url;

    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(blob);
    };

    const timeout = window.setTimeout(() => finish(null), 10000);

    const capture = () => {
      if (settled) return;
      try {
        const w = video.videoWidth || 0;
        const h = video.videoHeight || 0;
        if (w < 2 || h < 2) {
          window.clearTimeout(timeout);
          finish(null);
          return;
        }
        const scale = Math.min(1, maxWidth / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          window.clearTimeout(timeout);
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            window.clearTimeout(timeout);
            finish(blob);
          },
          "image/jpeg",
          quality
        );
      } catch {
        window.clearTimeout(timeout);
        finish(null);
      }
    };

    const tryCapture = () => {
      if (settled) return;
      const seekTo =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(0.15, Math.max(0.05, video.duration * 0.05))
          : 0;
      if (seekTo > 0) {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          capture();
        };
        video.addEventListener("seeked", onSeeked);
        try {
          video.currentTime = seekTo;
        } catch {
          capture();
        }
        return;
      }
      capture();
    };

    video.addEventListener("loadeddata", tryCapture, { once: true });
    video.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        finish(null);
      },
      { once: true }
    );
    void video.play().then(
      () => {
        video.pause();
        tryCapture();
      },
      () => {
        /* loadeddata path still runs */
      }
    );
  });
}

/** Frame capture, or a play-icon placeholder so Files always has a thumb. */
export async function extractVideoPosterJpegOrFallback(
  file: File
): Promise<Blob | null> {
  return (await extractVideoPosterJpeg(file)) ?? (await createFallbackVideoPosterJpeg());
}

/** Re-encode any image blob as JPEG (Snipping Tool stills are often PNG). */
export function imageBlobToJpegPoster(
  blob: Blob,
  quality = 0.85
): Promise<Blob | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  if (blob.type === "image/jpeg") return Promise.resolve(blob);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, img.naturalWidth || img.width);
        canvas.height = Math.max(1, img.naturalHeight || img.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (out) => {
            URL.revokeObjectURL(url);
            resolve(out);
          },
          "image/jpeg",
          quality
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
