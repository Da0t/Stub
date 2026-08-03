"use client";

// Demo-ready port of the Stub.dc.html design mockup. Mock data only — no
// camera, no IndexedDB, no Convex. Built fast for a live demo; not wired to
// real subsystems. See SPEC.md on the design project for the full spec.

import { useState } from "react";

const INK = "#17352f";
const PAPER = "#eee3c3";
const PANEL = "#f5edda";
const ACCENT = "#d96842";
const ALT = "#e8cc83";

type Tab = "capture" | "lineup" | "shelf" | "wrapped";

function CardFace({
  artist,
  stage,
  bg,
}: {
  artist: string;
  stage: string;
  bg: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "5/7",
        background: bg,
        border: `2px solid ${INK}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: 12,
        fontFamily: "Georgia, serif",
        color: INK,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".14em" }}>
        {stage.toUpperCase()}
      </div>
      <div style={{ fontSize: 18, marginTop: 2 }}>{artist}</div>
    </div>
  );
}

const STAGE_ROWS = [
  { stage: "LANDS END", status: "LIVE", statusColor: ACCENT, now: "Thundercat", headliner: true, window: "7:15 – 8:30 PM", next: "SZA", pct: "62%" },
  { stage: "TWIN PEAKS", status: "LIVE", statusColor: ACCENT, now: "Rüfüs Du Sol", headliner: false, window: "6:40 – 7:50 PM", next: "Disclosure", pct: "40%" },
  { stage: "SUTRO", status: "LIVE", statusColor: ACCENT, now: "Fred again..", headliner: true, window: "7:00 – 8:15 PM", next: "Four Tet", pct: "51%" },
  { stage: "SOMA", status: "DARK", statusColor: "rgba(23,53,47,.4)", now: "—", headliner: false, window: "Next set 9:10 PM", next: "Overmono", pct: "0%" },
  { stage: "DUBOCE TRIANGLE", status: "LIVE", statusColor: ACCENT, now: "Bicep", headliner: false, window: "7:10 – 8:05 PM", next: "Jamie xx", pct: "70%" },
];

const SHELF_CARDS = [
  { artist: "Thundercat", stage: "Sutro", bg: PANEL },
  { artist: "Bicep", stage: "Duboce Triangle", bg: ALT },
  { artist: "Fred again..", stage: "Sutro", bg: "#dce5df" },
  { artist: "Rüfüs Du Sol", stage: "Twin Peaks", bg: PANEL },
  { artist: "SZA", stage: "Lands End", bg: ALT },
  { artist: "Jamie xx", stage: "Duboce Triangle", bg: "#dce5df" },
];

const WRAPPED_PANELS = [
  { kicker: "LONGEST RUN", figure: "47", unit: "MIN", line: "You stayed through the whole Bicep set.", source: "longestRun" },
  { kicker: "SETS SKIPPED", figure: "3", unit: "SKIPPED", line: "You chose Sutro over three overlapping sets.", source: "concurrentSetsSkipped" },
  { kicker: "NEW ARTISTS", figure: "4", unit: "DISCOVERED", line: "Four artists you'd never seen live before.", source: "discoveryRate" },
  { kicker: "AFTER DARK", figure: "68", unit: "%", line: "Most of your weekend happened after sunset.", source: "nightRatio" },
];

export default function DemoPage() {
  const [tab, setTab] = useState<Tab>("capture");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [spinOpen, setSpinOpen] = useState(false);
  const [spinDone, setSpinDone] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const doSpin = () => {
    setSpinning(true);
    setTimeout(() => {
      setSpinning(false);
      setSpinDone(true);
    }, 1500);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#e4d9b5",
        color: INK,
        fontFamily: "Arial, Helvetica, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "clamp(0px,3vw,44px)",
      }}
    >
      <div style={{ position: "relative", width: "min(100%,402px)" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            background: INK,
            borderRadius: "clamp(0px,4.4vw,42px)",
            padding: "clamp(0px,1.1vw,11px)",
            boxShadow: "clamp(0px,1.4vw,14px) clamp(0px,1.5vw,15px) 0 #b8a672",
          }}
        >
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              height: "min(100svh,838px)",
              borderRadius: "clamp(0px,3.4vw,32px)",
              background: PAPER,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* status bar */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 22px 4px", fontSize: 13, fontWeight: 800 }}>
              <span>8:45</span>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <div style={{ width: 15, height: 8, border: `1.5px solid ${INK}` }} />
                <div style={{ width: 15, height: 8, background: INK }} />
              </div>
            </div>

            {/* top bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 16px 12px", borderBottom: `2px solid ${INK}` }}>
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                style={{ display: "flex", flexDirection: "column", gap: 4, width: 40, height: 36, alignItems: "center", justifyContent: "center", border: `2px solid ${INK}`, background: "transparent", cursor: "pointer" }}
              >
                <span style={{ width: 16, height: 2, background: INK }} />
                <span style={{ width: 16, height: 2, background: INK }} />
                <span style={{ width: 10, height: 2, background: ACCENT }} />
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 9, height: 22, background: ACCENT }} />
                <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 21, letterSpacing: ".24em" }}>STUB</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", border: `2px solid ${INK}`, fontSize: 10, fontWeight: 800, letterSpacing: ".12em" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: INK }} />
                58° FOG
              </div>
            </div>

            {/* CAPTURE */}
            {tab === "capture" && (
              <div style={{ flex: "1 1 auto", position: "relative", overflow: "hidden", padding: "14px 16px 0" }}>
                <div style={{ position: "absolute", left: 16, right: 16, top: 14, bottom: 100, border: `2px solid ${INK}`, boxShadow: `7px 8px 0 ${INK}`, overflow: "hidden", background: INK }}>
                  <div style={{ position: "absolute", inset: "-8%", background: "repeating-linear-gradient(58deg,#1d423a 0 14px,#17352f 14px 28px)" }} />
                  <div style={{ position: "absolute", left: 22, right: 22, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
                    <div style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 11, letterSpacing: ".16em", color: ALT, lineHeight: 1.9 }}>
                      DEMO MODE
                      <br />
                      <span style={{ color: "rgba(238,227,195,.55)" }}>camera stands in for the live feed</span>
                    </div>
                  </div>
                  {[
                    { left: 14, top: 12, borderSide: "borderLeft borderTop" },
                    { right: 14, top: 12, borderSide: "borderRight borderTop" },
                    { left: 14, bottom: 12, borderSide: "borderLeft borderBottom" },
                    { right: 14, bottom: 12, borderSide: "borderRight borderBottom" },
                  ].map((c, i) => (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: c.left,
                        right: c.right,
                        top: c.top,
                        bottom: c.bottom,
                        width: 22,
                        height: 22,
                        borderLeft: c.borderSide.includes("Left") ? "2px solid rgba(238,227,195,.6)" : undefined,
                        borderRight: c.borderSide.includes("Right") ? "2px solid rgba(238,227,195,.6)" : undefined,
                        borderTop: c.borderSide.includes("Top") ? "2px solid rgba(238,227,195,.6)" : undefined,
                        borderBottom: c.borderSide.includes("Bottom") ? "2px solid rgba(238,227,195,.6)" : undefined,
                      }}
                    />
                  ))}
                  <div style={{ position: "absolute", left: 44, right: 44, top: 11, display: "flex", justifyContent: "center", gap: 6 }}>
                    <div style={{ padding: "5px 9px", background: PAPER, fontSize: 10, fontWeight: 800, letterSpacing: ".1em" }}>0 pending</div>
                    <div style={{ padding: "5px 9px", background: ACCENT, fontSize: 10, fontWeight: 800, letterSpacing: ".1em" }}>OFFLINE OK</div>
                  </div>
                  <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, padding: "12px 14px", background: PANEL, border: `2px solid ${INK}`, display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: ACCENT }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".18em" }}>PRESENCE VERIFIED</div>
                      <div style={{ marginTop: 3, fontFamily: "Georgia,serif", fontSize: 16 }}>Thundercat card is waiting</div>
                      <div style={{ marginTop: 2, fontSize: 11, color: "rgba(23,53,47,.6)" }}>Sutro · 7:15 – 8:30 PM</div>
                    </div>
                    <button onClick={() => { setSpinOpen(true); setSpinDone(false); }} style={{ border: 0, borderRadius: 99, padding: "11px 16px", background: INK, color: PANEL, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                      Reveal
                    </button>
                  </div>
                </div>
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                  <button aria-label="Take photo" style={{ width: 70, height: 70, borderRadius: "50%", border: `4px solid ${INK}`, background: PANEL, cursor: "pointer" }} />
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".14em", color: "rgba(23,53,47,.72)" }}>TAP TO SHOOT</div>
                </div>
              </div>
            )}

            {/* LINEUP */}
            {tab === "lineup" && (
              <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "20px 26px 104px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".25em" }}>OUTSIDE LANDS · 2026</div>
                <h1 style={{ margin: "12px 0 0", fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 46, lineHeight: 0.92, letterSpacing: "-.05em" }}>On now.</h1>
                <p style={{ margin: "10px 0 20px", fontFamily: "Georgia,serif", fontSize: 16, lineHeight: 1.4 }}>Sat Aug 8, 8:45 PM. Demo data — not the live grid.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {STAGE_ROWS.map((row) => (
                    <div key={row.stage} style={{ padding: 16, background: PANEL, border: `2px solid ${INK}`, boxShadow: `7px 8px 0 ${INK}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".18em" }}>{row.stage}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 900, letterSpacing: ".12em", color: row.statusColor }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: row.statusColor }} />
                          {row.status}
                        </div>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                        <div style={{ fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 28, lineHeight: 1.04, letterSpacing: "-.035em" }}>{row.now}</div>
                        {row.headliner && <span style={{ padding: "3px 7px", background: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: ".14em" }}>HEADLINER</span>}
                      </div>
                      <div style={{ marginTop: 5, fontFamily: "Georgia,serif", fontSize: 14, color: "rgba(23,53,47,.7)" }}>{row.window}</div>
                      <div style={{ marginTop: 12, height: 4, background: "rgba(23,53,47,.18)" }}>
                        <div style={{ height: "100%", background: ACCENT, width: row.pct }} />
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `2px solid ${INK}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".16em", color: "rgba(23,53,47,.5)" }}>UP NEXT</div>
                          <div style={{ marginTop: 3, fontFamily: "Georgia,serif", fontSize: 15 }}>{row.next}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SHELF */}
            {tab === "shelf" && (
              <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "20px 26px 104px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".25em" }}>OUTSIDE LANDS · 2026</div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, margin: "12px 0 20px" }}>
                  <h1 style={{ margin: 0, fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 50, lineHeight: 0.9, letterSpacing: "-.05em" }}>Your shelf.</h1>
                  <div style={{ padding: "7px 11px", background: ACCENT, fontSize: 11, fontWeight: 900, letterSpacing: ".08em" }}>{SHELF_CARDS.length}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "22px 16px" }}>
                  {SHELF_CARDS.map((card, i) => (
                    <button key={i} onClick={() => { setDetailOpen(i); setFlipped(false); }} style={{ display: "block", padding: 0, border: `2px solid ${INK}`, background: "transparent", boxShadow: `6px 7px 0 ${INK}`, cursor: "pointer" }}>
                      <CardFace artist={card.artist} stage={card.stage} bg={card.bg} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* WRAPPED */}
            {tab === "wrapped" && (
              <div style={{ flex: "1 1 auto", overflowY: "auto" }}>
                {WRAPPED_PANELS.map((w, i) => (
                  <section key={i} style={{ minHeight: "70%", display: "grid", alignContent: "center", justifyItems: "center", gap: 16, padding: "26px 26px 44px", background: i % 3 === 0 ? PAPER : i % 3 === 1 ? ACCENT : ALT }}>
                    <div style={{ width: "100%", maxWidth: 320, padding: "20px 20px 24px", background: PANEL, border: `2px solid ${INK}`, boxShadow: `8px 9px 0 ${INK}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 900, letterSpacing: ".22em" }}>
                        <span>{w.kicker}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(23,53,47,.5)" }}>{w.source}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "20px 0 8px" }}>
                        <span style={{ fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 76, lineHeight: 0.8, letterSpacing: "-.06em" }}>{w.figure}</span>
                        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>{w.unit}</span>
                      </div>
                      <h2 style={{ margin: "0 0 18px", fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 23, lineHeight: 1.15, letterSpacing: "-.03em" }}>{w.line}</h2>
                      <div style={{ width: 64, height: 3, background: INK }} />
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* bottom tabs */}
            <div style={{ position: "relative", zIndex: 5, display: "grid", gridTemplateColumns: "repeat(4,1fr)", background: PAPER, borderTop: `2px solid ${INK}` }}>
              {([
                { id: "capture", label: "CAPTURE" },
                { id: "lineup", label: "LINEUP" },
                { id: "shelf", label: "SHELF" },
                { id: "wrapped", label: "WRAPPED" },
              ] as const).map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "11px 0 14px", border: 0, borderRight: `2px solid ${INK}`, background: active ? ALT : PAPER, cursor: "pointer" }}
                  >
                    <div style={{ width: 22, height: 22, display: "grid", placeItems: "center" }}>
                      <div style={{ width: 12, height: 12, borderRadius: active ? "50%" : 0, border: `2px solid ${INK}`, background: active ? INK : "transparent" }} />
                    </div>
                    <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: ".12em", color: INK }}>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* drawer */}
            {drawerOpen && (
              <div style={{ position: "absolute", inset: 0, zIndex: 40 }}>
                <div onClick={() => setDrawerOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(23,53,47,.55)" }} />
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "76%", maxWidth: 292, padding: "24px 22px", background: PANEL, borderRight: `3px solid ${INK}`, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 30 }}>
                    <div style={{ width: 9, height: 22, background: ACCENT }} />
                    <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 21, letterSpacing: ".24em" }}>STUB</div>
                  </div>
                  {(["Capture", "Lineup", "Shelf", "Wrapped"] as const).map((label) => (
                    <button
                      key={label}
                      onClick={() => { setTab(label.toLowerCase() as Tab); setDrawerOpen(false); }}
                      style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "15px 4px", border: 0, borderBottom: `2px solid ${INK}`, background: "transparent", textAlign: "left", cursor: "pointer" }}
                    >
                      <span style={{ fontFamily: "Georgia,serif", fontSize: 21, letterSpacing: "-.02em" }}>{label}</span>
                    </button>
                  ))}
                  <div style={{ marginTop: "auto", paddingTop: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", background: ACCENT, border: `2px solid ${INK}` }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: INK }} />
                      <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.35 }}>0 pending · syncs when signal returns</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* card detail */}
            {detailOpen !== null && (
              <div onClick={() => setDetailOpen(null)} style={{ position: "absolute", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 26, background: "rgba(23,53,47,.8)" }}>
                <div style={{ width: "min(76%,250px)", perspective: 1300 }}>
                  <div
                    onClick={(e) => { e.stopPropagation(); setFlipped((f) => !f); }}
                    style={{ position: "relative", width: "100%", aspectRatio: "5/7", transformStyle: "preserve-3d", cursor: "pointer", transition: "transform .58s cubic-bezier(.2,.7,.2,1)", transform: flipped ? "rotateY(180deg)" : "none" }}
                  >
                    <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}>
                      <CardFace artist={SHELF_CARDS[detailOpen].artist} stage={SHELF_CARDS[detailOpen].stage} bg={SHELF_CARDS[detailOpen].bg} />
                    </div>
                    <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", padding: "24px 20px", display: "flex", flexDirection: "column", background: PANEL, border: `2px solid ${INK}` }}>
                      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".2em" }}>YOU WERE THERE</div>
                      <h2 style={{ margin: "6px 0 16px", fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 28, letterSpacing: "-.04em" }}>{SHELF_CARDS[detailOpen].artist}</h2>
                      <p style={{ marginTop: "auto", fontSize: 11, lineHeight: 1.45, color: "rgba(23,53,47,.62)" }}>Rarity comes from attendance facts, never an assigned tier.</p>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, textAlign: "center", fontSize: 10, fontWeight: 800, letterSpacing: ".16em", color: PAPER }}>TAP THE CARD TO FLIP</div>
                </div>
              </div>
            )}

            {/* spin sheet */}
            {spinOpen && (
              <div onClick={() => setSpinOpen(false)} style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", background: "rgba(23,53,47,.6)" }}>
                <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "94%", overflowY: "auto", padding: "16px 24px 30px", background: PANEL, borderTop: `3px solid ${INK}` }}>
                  <div style={{ width: 44, height: 4, margin: "0 auto 16px", background: INK }} />
                  {spinDone ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".22em" }}>IT&apos;S YOURS</div>
                      <h2 style={{ margin: "10px 0 0", fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 38, letterSpacing: "-.05em" }}>Thundercat</h2>
                      <div style={{ width: "min(52%,180px)", margin: "18px 0 12px", border: `2px solid ${INK}`, boxShadow: `8px 9px 0 ${INK}` }}>
                        <CardFace artist="Thundercat" stage="Duboce Triangle" bg={ALT} />
                      </div>
                      <p style={{ margin: "0 0 16px", maxWidth: 280, fontFamily: "Georgia,serif", fontSize: 16, lineHeight: 1.45 }}>One set. Your photo. Your card.</p>
                      <button onClick={() => { setSpinOpen(false); setTab("shelf"); }} style={{ minWidth: 210, border: 0, borderRadius: 99, padding: "14px 20px", background: INK, color: PANEL, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                        See it on my shelf
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".22em" }}>PRESENCE VERIFIED</div>
                      <h2 style={{ margin: "10px 0 0", maxWidth: 300, fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 31, lineHeight: 1.06, letterSpacing: "-.04em" }}>Your Thundercat card is ready.</h2>
                      <p style={{ margin: "10px 0 0", maxWidth: 290, fontFamily: "Georgia,serif", fontSize: 16, lineHeight: 1.4, color: "rgba(23,53,47,.75)" }}>The card is already earned. The reveal only shows which frame you got.</p>
                      <div style={{ width: 148, aspectRatio: "5/7", margin: "20px 0", padding: 16, border: `2px solid ${INK}`, boxShadow: `8px 9px 0 ${INK}`, display: "grid", placeItems: "end center", background: ALT, fontFamily: "Georgia,serif", fontWeight: 500, fontSize: 18, transform: spinning ? "rotateY(180deg) scale(.88)" : "none", transition: "transform 1.5s cubic-bezier(.2,.7,.15,1)" }}>
                        ?
                      </div>
                      <button onClick={doSpin} disabled={spinning} style={{ minWidth: 210, border: 0, borderRadius: 99, padding: "14px 20px", background: INK, color: PANEL, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: spinning ? 0.6 : 1 }}>
                        {spinning ? "Revealing…" : "Reveal my card"}
                      </button>
                      <button onClick={() => setSpinOpen(false)} style={{ marginTop: 10, padding: 10, border: 0, background: "transparent", color: "rgba(23,53,47,.6)", fontSize: 13, cursor: "pointer" }}>
                        Later — it will wait
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 10, fontWeight: 800, letterSpacing: ".2em", color: "rgba(23,53,47,.72)" }}>
          FAN · MOBILE WEB · DEMO
        </div>
      </div>
    </div>
  );
}
