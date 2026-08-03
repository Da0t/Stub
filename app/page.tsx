"use client";

// app/page.tsx — the capture screen (root route).
//
// Opens straight to a camera. No splash, no onboarding, no login wall, no
// tagging. The first thing the user sees is a viewfinder. The shutter fires a
// confirmation off the IndexedDB write, never off the network.

import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/lib/capture/useCamera";
import { captureFromFile } from "@/lib/capture/camera";
import { startPositionWatch, spoofToStage } from "@/lib/offline/position";
import {
  startSync,
  onPendingChange,
  notifyPendingChanged,
} from "@/lib/offline/sync";

export default function CapturePage() {
  const { videoRef, status, errorKind, ready, takePhoto, retry } = useCamera();
  const [pending, setPending] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [spoofLabel, setSpoofLabel] = useState<string | null>(null);
  const busyRef = useRef(false);

  // Only show operator feedback (spoof badge) when explicitly in dev, so the
  // affordance stays invisible to an audience during the live demo.
  const devMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("dev");

  // Start position watch + sync engine once, for the life of the screen.
  useEffect(() => {
    const stopWatch = startPositionWatch();
    const stopSync = startSync();
    const off = onPendingChange(setPending);
    return () => {
      off();
      stopSync();
      stopWatch();
    };
  }, []);

  const onShutter = useCallback(async () => {
    // Allow rapid fire; just guard a single in-flight canvas encode per tap.
    if (busyRef.current || !ready) return;
    busyRef.current = true;
    try {
      await takePhoto(); // resolves after the IndexedDB write commits
      setFlashKey((k) => k + 1); // confirmation is off the durable write
      void notifyPendingChanged();
    } catch {
      // A failed capture is silent to the user; the shutter stays responsive.
    } finally {
      busyRef.current = false;
    }
  }, [ready, takePhoto]);

  // Fallback capture path. `capture="environment"` on the input opens the
  // camera directly on a phone and a file picker on a laptop, so this works
  // where getUserMedia cannot: no rear camera, denied permission, or an
  // insecure context (http:// on a LAN IP — unavailable by spec, unfixable in
  // code). The photo is still the user's own, so the card face is still theirs.
  const onPickFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ""; // allow re-picking the same file
      if (!file || busyRef.current) return;
      busyRef.current = true;
      try {
        await captureFromFile(file);
        setFlashKey((k) => k + 1);
        void notifyPendingChanged();
      } catch {
        // Same silent-failure policy as the shutter.
      } finally {
        busyRef.current = false;
      }
    },
    [],
  );

  // Long-press the viewfinder to advance the demo spoof to the next stage
  // centroid (dev affordance). Query-param spoof (?spoof=lat,lng) also works.
  const stageIdxRef = useRef(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginPress = useCallback(() => {
    pressTimer.current = setTimeout(async () => {
      const idx = stageIdxRef.current;
      const ok = await spoofToStage(idx);
      if (ok) {
        stageIdxRef.current = idx + 1;
        if (devMode) {
          setSpoofLabel(`spoof → stage ${idx}`);
          setTimeout(() => setSpoofLabel(null), 1200);
        }
      } else {
        stageIdxRef.current = 0; // wrap / no grid yet
        if (devMode) {
          setSpoofLabel("no grid");
          setTimeout(() => setSpoofLabel(null), 1200);
        }
      }
    }, 700);
  }, [devMode]);

  const endPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      {/* Layer 0: the viewfinder. Full-bleed, cover-fit. */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        autoPlay
        onPointerDown={beginPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
      />

      {/* Shutter flash: a brief white wash keyed to each successful write. */}
      {flashKey > 0 && (
        <div
          key={flashKey}
          className="pointer-events-none absolute inset-0 bg-white"
          style={{ animation: "shutter-flash 220ms ease-out forwards" }}
        />
      )}

      {/* Honest pending indicator. No spinner, no modal, no toast. */}
      {pending > 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs font-medium tabular-nums text-white/80"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          {pending} pending
        </div>
      )}

      {/* Dev-only spoof feedback. Hidden from an audience by default. */}
      {devMode && spoofLabel && (
        <div
          className="absolute rounded bg-black/60 px-2 py-1 text-[11px] text-white/70"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            left: "12px",
          }}
        >
          {spoofLabel}
        </div>
      )}

      {/* Failure / permission states. */}
      {status === "error" && <CameraFailure kind={errorKind} onRetry={retry} />}

      {status === "starting" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-white/40">Starting camera…</span>
        </div>
      )}

      {/* Shutter button: fixed bottom-center, large tap target, safe-area pad. */}
      <div
        className="absolute bottom-0 left-0 right-0 flex justify-center"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
      >
        <button
          type="button"
          aria-label="Take photo"
          onClick={onShutter}
          disabled={status !== "live"}
          className="h-20 w-20 rounded-full border-4 border-white bg-white/20 shadow-[0_0_0_2px_rgba(0,0,0,0.35)] transition active:scale-95 disabled:opacity-40"
        >
          <span className="sr-only">Take photo</span>
        </button>
      </div>

      {/* Fallback capture. Always mounted — it is the only way in when the live
          stream is unavailable, and a harmless second option when it is not. */}
      <label
        className="absolute right-4 rounded-full border border-white/30 bg-black/50 px-4 py-2 text-sm text-white/80 backdrop-blur active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 44px)" }}
      >
        {status === "live" ? "Upload" : "Choose photo"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPickFile}
          className="sr-only"
        />
      </label>

      {/* Keyframes inline so app/globals.css (not owned by path 1) is untouched. */}
      <style>{`
        @keyframes shutter-flash {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
      `}</style>
    </main>
  );
}

function CameraFailure({
  kind,
  onRetry,
}: {
  kind: string | null;
  onRetry: () => void;
}) {
  const copy = messageFor(kind);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-base text-white/90">{copy.title}</p>
      {copy.detail && <p className="text-sm text-white/50">{copy.detail}</p>}
      {copy.canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-white/40 px-5 py-2 text-sm text-white/90 active:scale-95"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function messageFor(kind: string | null): {
  title: string;
  detail?: string;
  canRetry: boolean;
} {
  switch (kind) {
    case "denied":
      return {
        title: "Camera access is off",
        detail: "Enable the camera for this site, then tap Try again.",
        canRetry: true,
      };
    case "notfound":
      return { title: "No camera found on this device", canRetry: true };
    case "insecure":
      return {
        title: "Camera needs a secure connection",
        detail: "Open this over HTTPS (a preview URL), not a plain LAN address.",
        canRetry: false,
      };
    case "unsupported":
      return { title: "This browser can’t open the camera", canRetry: false };
    default:
      return { title: "Couldn’t start the camera", canRetry: true };
  }
}
