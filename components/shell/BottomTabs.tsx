"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Capture", glyph: "◎" },
  { href: "/now", label: "Lineup", glyph: "▤" },
  { href: "/shelf", label: "Shelf", glyph: "▦" },
  { href: "/wrapped", label: "Wrapped", glyph: "✦" },
] as const;

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t"
      style={{
        borderColor: "rgba(23,53,47,.12)",
        background: "rgba(238,227,195,.94)",
        backdropFilter: "blur(18px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-1 flex-col items-center gap-1 py-2.5"
            style={{ color: active ? "var(--accent)" : "rgba(23,53,47,.72)" }}
          >
            <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
              {tab.glyph}
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 800,
                fontSize: 9.5,
                letterSpacing: ".12em",
                textTransform: "uppercase",
              }}
            >
              {tab.label}
            </span>
            <span
              style={{
                marginTop: 2,
                height: 2,
                width: 16,
                borderRadius: 1,
                background: active ? "var(--accent)" : "transparent",
                transition: "background 160ms ease",
              }}
            />
          </Link>
        );
      })}
    </nav>
  );
}
