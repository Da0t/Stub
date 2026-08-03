"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { BottomTabs } from "./BottomTabs";
import { Drawer } from "./Drawer";

// Capture is a full-bleed viewfinder — SPEC.md §6: "Corner brackets frame the
// viewfinder — a viewfinder should look like one." No shell chrome over it.
const CHROMELESS_ROUTES = new Set(["/"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const chromeless = CHROMELESS_ROUTES.has(pathname);

  if (chromeless) {
    return <>{children}</>;
  }

  return (
    <div style={{ minHeight: "100svh", background: "var(--paper)" }}>
      <header
        className="sticky top-0 z-30 flex items-center gap-3 border-b px-4"
        style={{
          borderColor: "rgba(23,53,47,.12)",
          background: "rgba(238,227,195,.94)",
          backdropFilter: "blur(18px)",
          paddingTop: "env(safe-area-inset-top)",
          height: 52,
        }}
      >
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: 8,
            marginLeft: -8,
            background: "transparent",
            border: 0,
          }}
        >
          <span style={{ width: 18, height: 2, background: "var(--ink)" }} />
          <span style={{ width: 18, height: 2, background: "var(--ink)" }} />
        </button>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "Georgia, serif",
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: ".24em",
            color: "var(--ink)",
          }}
        >
          <span style={{ width: 9, height: 22, background: "var(--accent)" }} />
          STUB
        </span>
      </header>

      <main style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom))" }}>
        {children}
      </main>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <BottomTabs />
    </div>
  );
}
