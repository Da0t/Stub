"use client";

import { useEffect } from "react";

// Exact copy of the Stub.dc.html design artifact, served statically from
// /public/stub-mockup (support.js + CardFace.dc.html included). Demo-only —
// no camera/IndexedDB/Convex wiring, mock data baked into the mockup itself.
export default function DemoPage() {
  useEffect(() => {
    window.location.replace("/stub-mockup/Stub.dc.html");
  }, []);
  return null;
}
