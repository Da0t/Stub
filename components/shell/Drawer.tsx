"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPendingCount, onPendingChange } from "@/lib/offline/sync";

const ITEMS = [
  { href: "/", label: "Capture", tag: null },
  { href: "/now", label: "Lineup", tag: "LIVE" },
  { href: "/shelf", label: "Shelf", tag: null },
  { href: "/wrapped", label: "Wrapped", tag: null },
  { href: "/artist", label: "Artist Desk", tag: "DESK" },
  { href: "/debug/frames", label: "Render Lab", tag: "DEV" },
  { href: "/demo", label: "Demo", tag: "DEMO" },
] as const;

export function Drawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPendingCount().then((n) => {
      if (!cancelled) setPending(n);
    });
    const off = onPendingChange(setPending);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(11,41,37,.5)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 280ms ease",
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 51,
          width: "76%",
          maxWidth: 290,
          background: "linear-gradient(170deg,#173f35,#0b2925)",
          color: "#f2e6c8",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 340ms cubic-bezier(.2,.85,.25,1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <nav style={{ flex: 1, overflowY: "auto", paddingTop: 24 }}>
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 22px",
                borderBottom: "1px solid rgba(242,230,200,.10)",
                fontFamily: "Georgia, serif",
                fontSize: 19,
                color: "#f2e6c8",
                textDecoration: "none",
              }}
            >
              <span>{item.label}</span>
              {item.tag && (
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontWeight: 800,
                    fontSize: 9,
                    letterSpacing: ".14em",
                    color: "rgba(242,230,200,.55)",
                  }}
                >
                  {item.tag}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div
          style={{
            padding: "16px 22px",
            borderTop: "1px solid rgba(242,230,200,.10)",
            fontFamily: "var(--font-sans)",
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "rgba(242,230,200,.55)",
          }}
        >
          {pending > 0 ? `${pending} pending sync` : "All synced"}
        </div>
      </aside>
    </>
  );
}
