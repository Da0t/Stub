// lib/capture/camera.ts
//
// getUserMedia lifecycle, shutter, and capture-to-blob (path 1).
//
// The one rule that outranks everything: capture() writes the photo to
// IndexedDB *before* it resolves, and there is no network call anywhere on the
// path between the shutter and the user-visible confirmation. A photo is a
// blob + a coordinate + a device timestamp; nothing else is invented.

import { putPhoto } from "@/lib/offline/db";
import { getWarmPosition } from "@/lib/offline/position";
import type { CapturedPhoto } from "@/lib/types";

export type CameraErrorKind =
  | "denied" // user refused the camera permission
  | "notfound" // no camera on the device
  | "insecure" // not a secure context (getUserMedia unavailable)
  | "unsupported" // browser lacks mediaDevices/getUserMedia
  | "notready" // asked to capture before a frame exists
  | "unknown";

export class CameraError extends Error {
  kind: CameraErrorKind;
  constructor(kind: CameraErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "CameraError";
    this.kind = kind;
  }
}

// Sentinel latitude/longitude for "no fix yet". The frozen contract types
// lat/lng as `number`, and the core invariant forbids inventing a coordinate
// (0,0 is a real place in the Gulf of Guinea). NaN is a number that is
// unmistakably not a location, is detectable with Number.isNaN, and serialises
// to JSON null on upload — i.e. "flagged for later best-effort backfill".
const NO_FIX = Number.NaN;

let activeStream: MediaStream | null = null;
let activeVideo: HTMLVideoElement | null = null;

function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function mapGetUserMediaError(err: unknown): CameraError {
  const name = (err as { name?: string })?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new CameraError("denied", "Camera permission was denied.");
    case "NotFoundError":
    case "OverconstrainedError":
      return new CameraError("notfound", "No usable camera was found.");
    default:
      return new CameraError("unknown", (err as Error)?.message);
  }
}

/**
 * Acquire the rear camera and attach it to `video`. Resolves once the stream
 * is playing. Throws a CameraError with a normalised `kind` for the UI.
 */
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    // Most often this is a non-secure context (LAN IP over plain HTTP).
    const secure =
      typeof window !== "undefined" && window.isSecureContext === false;
    throw new CameraError(
      secure ? "unsupported" : "insecure",
      "getUserMedia is unavailable (needs a secure context)."
    );
  }

  // Reuse a live stream if we still have one (e.g. fast re-mount).
  if (activeStream && activeStream.getVideoTracks().some((t) => t.readyState === "live")) {
    attach(video, activeStream);
    await playSafely(video);
    return;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (err) {
    throw mapGetUserMediaError(err);
  }

  activeStream = stream;
  attach(video, stream);
  await playSafely(video);
}

function attach(video: HTMLVideoElement, stream: MediaStream): void {
  activeVideo = video;
  video.srcObject = stream;
  // iOS Safari needs these or it tries to go fullscreen / won't autoplay.
  video.playsInline = true;
  video.muted = true;
}

async function playSafely(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
  } catch {
    // Autoplay can reject if not yet user-activated; the element still shows
    // frames once activated. Not fatal to capture.
  }
}

/** Stop all tracks and detach. Call on background / unmount to free the camera. */
export function stopCamera(): void {
  if (activeStream) {
    for (const track of activeStream.getTracks()) track.stop();
  }
  activeStream = null;
  if (activeVideo) {
    activeVideo.srcObject = null;
  }
}

/** True once the active video has real pixels to draw. */
export function isCameraReady(): boolean {
  return (
    !!activeVideo &&
    activeVideo.readyState >= 2 && // HAVE_CURRENT_DATA
    activeVideo.videoWidth > 0 &&
    activeVideo.videoHeight > 0
  );
}

function toJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new CameraError("unknown", "canvas.toBlob returned null"));
      },
      "image/jpeg",
      0.85
    );
  });
}

/**
 * Take a photo. Draws the current video frame to an offscreen canvas, encodes
 * a JPEG blob, stamps it with the warm position and the device clock, and
 * writes it to IndexedDB. Resolves only after the IndexedDB write commits.
 *
 * No network call is on this path. The shutter confirmation in the UI is fired
 * off this promise resolving, i.e. off the durable write — never off a fetch.
 */
export async function capture(): Promise<CapturedPhoto> {
  const video = activeVideo;
  if (!video || !isCameraReady()) {
    throw new CameraError("notready", "Camera has no frame to capture yet.");
  }

  const width = video.videoWidth;
  const height = video.videoHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CameraError("unknown", "2D canvas context unavailable.");
  ctx.drawImage(video, 0, 0, width, height);

  const blob = await toJpegBlob(canvas);

  // Read the most recent cached position — never request a fresh fix, which
  // would stall the shutter for seconds. No warm value yet → NO_FIX sentinel.
  const warm = getWarmPosition();
  const photo: CapturedPhoto = {
    clientId: newClientId(),
    ts: Date.now(), // device clock; server records its own arrival time
    lat: warm ? warm.lat : NO_FIX,
    lng: warm ? warm.lng : NO_FIX,
    accuracy: warm ? warm.accuracy : null,
    blob,
    synced: false,
  };

  // Write-before-resolve. This await is the whole product claim.
  await putPhoto(photo);
  return photo;
}

/** Whether a photo's coordinate is a real fix (vs. the NO_FIX sentinel). */
export function hasFix(photo: CapturedPhoto): boolean {
  return Number.isFinite(photo.lat) && Number.isFinite(photo.lng);
}
