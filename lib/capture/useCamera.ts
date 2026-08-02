// lib/capture/useCamera.ts
//
// React hook wrapper around the camera controller (path 1). Owns the video
// element ref, the start/stop lifecycle, and the backgrounded-tab handling:
// stop tracks on visibilitychange (frees the camera + battery), restart on
// return. Capture itself stays in camera.ts so the write-before-resolve rule
// lives in one place.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CameraError,
  capture,
  isCameraReady,
  startCamera,
  stopCamera,
  type CameraErrorKind,
} from "@/lib/capture/camera";
import type { CapturedPhoto } from "@/lib/types";

export type CameraStatus = "starting" | "live" | "error";

export interface UseCamera {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  errorKind: CameraErrorKind | null;
  ready: boolean;
  /** Take a photo. Resolves after the IndexedDB write; rejects on failure. */
  takePhoto: () => Promise<CapturedPhoto>;
  /** Retry acquiring the camera after a failure (e.g. user granted access). */
  retry: () => void;
}

export function useCamera(): UseCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [errorKind, setErrorKind] = useState<CameraErrorKind | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // `begin` only sets state *after* the await — never synchronously inside the
  // effect — so it syncs an external system (the camera) without cascading
  // renders. The synchronous "reset to starting" lives in `retry` (an event
  // handler), and the initial state is already "starting".
  const begin = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await startCamera(video);
      setStatus("live");
      setErrorKind(null);
    } catch (err) {
      const kind = err instanceof CameraError ? err.kind : "unknown";
      setErrorKind(kind);
      setStatus("error");
    }
  }, []);

  // Acquire on mount and whenever `retry` bumps `attempt`.
  useEffect(() => {
    // begin() starts the camera (an external system) and only calls setState
    // *after* its await — the canonical effect use. The lint rule over-fires
    // on async starts because it can't see the await boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void begin();
    return () => {
      stopCamera();
    };
    // begin is a stable useCallback([]) — re-run only when `attempt` bumps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Poll readiness cheaply until the first frame lands, then stop.
  useEffect(() => {
    if (status !== "live" || ready) return;
    let raf = 0;
    const check = () => {
      if (isCameraReady()) {
        setReady(true);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [status, ready]);

  // Backgrounded tabs: watchPosition and getUserMedia both misbehave when
  // hidden. Stop tracks on hide (frees the camera), re-acquire on return.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopCamera();
        setReady(false);
      } else {
        void begin();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [begin]);

  const takePhoto = useCallback(() => capture(), []);

  const retry = useCallback(() => {
    setStatus("starting");
    setErrorKind(null);
    setReady(false);
    setAttempt((a) => a + 1);
  }, []);

  return { videoRef, status, errorKind, ready, takePhoto, retry };
}
