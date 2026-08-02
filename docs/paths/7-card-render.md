# Path 7 — Card Rendering & Share Strip

**Branch:** `path/7-card-render`
**Mission:** Make the object beautiful. Five frames, one slot contract, and the single image that gets posted.

> Project overview: see `README.md` on `main`. Shared types: [docs/CONTRACTS.md](docs/CONTRACTS.md). **Read the contracts before writing code.**

---

## Why this path exists

The Wrapped **opens with an image, not a stat.** One card, framed, artist engraved. Spotify opens with typography over gradients because it has nothing real to show. We have the actual photographs, stamped with what was playing. That advantage only exists if the render is good.

And the strip is the reward mechanic the whole positioning rests on. A regular festival goer describing what is missing at this event asked for exactly this — engagement after the event, with rewards for posting on social media. **One strip. Twelve frames across three days, single shareable image.** That is what gets screenshotted and posted, which is why the festival wants it and why it is worth the render time.

You are also the least blocked path on the board. **You only need the slot contract**, which is already frozen in `docs/CONTRACTS.md` §6. You can build every frame before a single real photo exists.

---

## Scope

**In**
- The five frame templates as layered, slotted, data-driven renderers
- Client-side canvas render for the shelf (fast, offline-capable)
- Server-side render for the shareable strip (consistent output, correct fonts, no device variance)
- Typography, theme-pack art, treatments, the rarity mark
- Export sizing: 2x for retina, 3x for sharing

**Out**
- Deciding *which* variant a card gets → **path 6** (they pass `frameVariant`)
- Deciding rarity → **path 6** (you draw the mark above 0.7)
- Choosing the best photo → **path 8** (vision picks it; you receive a URL)
- The Wrapped page itself → **path 8** (you provide the renderers it mounts)

---

## Files you own

```
lib/render/types.ts             CardRenderInput (mirrors CONTRACTS §6)
lib/render/renderCard.ts        client canvas renderer
lib/render/frames/ranger.ts     ranger_badge
lib/render/frames/trail.ts      trail_marker
lib/render/frames/fog.ts        fog_layer
lib/render/frames/bison.ts      disco_bison
lib/render/frames/notes.ts      field_notes
lib/render/strip.ts             12-frame composition
lib/render/theme/               fonts, palette, bison + ranger art assets
app/api/strip/route.ts          server-side strip render endpoint
app/debug/frames/page.tsx       all five frames, live-tunable
public/theme/outside-lands-2026/  art assets
```

**Do not edit:** `lib/types.ts`, `lib/mint/*`, `convex/*`, `app/shelf/*`.

---

## Contracts

### You publish
```ts
renderCard(input: CardRenderInput, canvas: HTMLCanvasElement, scale?: number): Promise<void>
renderStrip(cards: CardRenderInput[]): Promise<Buffer>
```

### You consume
`CardRenderInput` — and nothing else. That is the whole dependency:

```ts
{
  photoUrl, frameVariant, artistName, stageName,
  dateLabel, setWindowLabel, dwellLabel, rarityScore, themePack
}
```

Path 6 mounts a canvas and calls you. Path 8 calls you for the strip. **You never fetch, never query Convex, never touch IndexedDB.**

---

## Build frames as layered templates with slots, never baked images

Five variants across any artist is then free.

```
layer 0  photo            (user's best frame, cover-fit, cropped to card ratio)
layer 1  treatment        (grain, wash, fog gradient — variant-specific)
layer 2  chrome           (border, badge shape, theme pack art)
layer 3  text slots       (artistName, stageName, date, setWindow, dwell)
layer 4  rarity mark      (only if rarityScore crosses threshold)
```

If you find yourself exporting a PNG with an artist's name already in it, stop — that is a baked image and it does not scale past the one artist you tested.

**Card ratio 5:7**, standard trading card proportions. Renders at **2x for retina**, exports at **3x for sharing**.

Frames are applied at **render** time, not capture time, so themes can improve without invalidating captured photos. A frame improvement at 4:30PM retroactively upgrades every card already minted. Use that — it means you can keep polishing right up to the freeze.

### The five frames

| Variant | Look |
|---|---|
| `ranger_badge` | Park signage. Heavy serif, forest green + cream, engraved artist/stage. |
| `trail_marker` | Vertical wooden sign, stacked names, arrows and distances. |
| `fog_layer` | Karl the Fog wash. **Intensity scales with set time** — read the hour off `setWindowLabel` or take an explicit intensity input from path 6. |
| `disco_bison` | The joke card. Real bison in the park, disco ball in their collage. |
| `field_notes` | Kraft paper, handwritten annotation, taped polaroid. **Wrapped summary page only** — never minted for a set. |

The ranger-and-bison theme is the **festival's own 2026 art program identity** ("Bison and Ranger Ruth"), not our invention. Lean into it hard; it will read as native to anyone who knows the event.

**August in SF is fog, wind, and cold. The fog card frame is literal, not decorative.** A judge who has been to Outside Lands in August has stood in that fog at 8PM.

`disco_bison` deserves real effort despite being the joke. Every set of frames needs one stupid card, because that is the one people post. A half-hearted joke card is worse than none.

### Text slots
- Artist name is the hero. It must handle "Hozier" and "Godspeed You! Black Emperor" — implement **auto-shrink to fit**, plus a two-line fallback.
- Engraved/letterpress effect: draw the text twice with a 1px offset and a lighter colour underneath. Cheap, and it sells the badge.
- Load fonts with `document.fonts.ready` before the first draw or your first render will silently use a fallback and look wrong exactly once — in the demo.

---

## The strip

**One strip. Twelve frames across three days, single shareable image, server-rendered.**

- Server-side so output is consistent — correct fonts, no device variance, no "it looked fine on my phone."
- Composition: a 3-column × 4-row grid, or three day-columns of four. Include the event name, dates, and a quiet footer mark. Do not clutter it — the photos are the content.
- Add a `field_notes` treatment as the outer frame: kraft paper, handwritten annotations, taped-polaroid feel. That is what makes it feel like an object rather than a contact sheet.
- Export at 3x, portrait, sized for an Instagram story (1080×1920) with the grid centred.

Implementation on Vercel: `@napi-rs/canvas` or `sharp` composition in a Node runtime route. **Do not use a headless browser** — it will not be worth the cold start today.

If fewer than twelve cards exist, lay out what there is gracefully. The seeded demo user has eleven; do not hard-code twelve.

---

## Task list

### T+0 → T+30 · Harness first
- [ ] `app/debug/frames/page.tsx` — render all five frames side by side from a hardcoded `CardRenderInput` with a placeholder photo, plus inputs to tweak artist name length, rarity, and variant live.
- [ ] **Build this before the frames.** It is your entire feedback loop for the next four hours.

### T+30 → T+50 · Layer engine
- [ ] `renderCard` — 5:7 canvas, scale param, `document.fonts.ready` gate.
- [ ] Layer 0: photo cover-fit with centre crop.
- [ ] Layer 1–4 dispatch to the variant module.

### T+50 → T+110 · The frames
- [ ] `ranger_badge` first — it is the default and covers headliners. Get it genuinely good before starting another.
- [ ] `fog_layer` second — evening/night sets are most of a festival day, and the fog gradient is the cheapest high-impact treatment on the list.
- [ ] `disco_bison` third — the one people post.
- [ ] `trail_marker` fourth.
- [ ] `field_notes` last, and only for the strip.

### T+110 → T+130 · Rarity mark
- [ ] Drawn only when `rarityScore > 0.7`. Small, embossed, in the chrome layer.
- [ ] **No tier names.** No "legendary." If it carries a label, the label is a fact.

### T+130 → T+180 · The strip
- [ ] `lib/render/strip.ts` composition.
- [ ] `app/api/strip/route.ts` — accepts `CardRenderInput[]`, returns a PNG.
- [ ] Test against the seeded eleven cards.
- [ ] Cache the result; do not re-render on every Wrapped view.

### T+180 → freeze · Polish
- [ ] Grain and paper texture — a subtle noise overlay is the single cheapest thing that makes canvas output stop looking like canvas output.
- [ ] Long-name stress test.
- [ ] Render time check: a shelf of 11 cards must not jank. Cache rendered bitmaps by `cardId`.

---

## Acceptance criteria

1. All five frames render from the same `CardRenderInput` with only `frameVariant` changed.
2. "Godspeed You! Black Emperor" fits legibly on every frame.
3. A card renders correctly with a locally-captured photo blob URL, offline.
4. `rarityScore = 0.9` shows a mark; `0.5` shows none.
5. `/api/strip` returns a single PNG of eleven seeded cards in under three seconds.
6. The strip is 1080×1920 and looks deliberate when screenshotted on a phone.
7. Zero network calls inside `renderCard`. Zero baked-in artist names anywhere.

---

## Cut lines

Extra frame variants are second on the global cut list:

1. Ship **three** frames: `ranger_badge`, `fog_layer`, `disco_bison`. Tell path 6 to reweight.
2. Rarity mark → drop.
3. Server-side strip → render it client-side and accept the font risk. **Do not drop the strip itself.**

**Never cut:** the layered slot architecture, or the strip. The first is what makes everything else cheap; the second is the artifact that gets posted.

---

## Demo responsibilities

- The Wrapped **opens with your card, full bleed.** That first frame is the most-looked-at pixel of the whole demo.
- Own the strip reveal — the last thing the judges see. Have it pre-rendered and cached; do not render live on stage.
- Own the sentence: *"Frames are layered templates with slots. Outside Lands wears ranger-and-bison; a different festival wears its own pack. You can tell someone's been to six festivals by looking at their shelf."*
- Have the debug frames page ready as a fallback artifact — if something upstream breaks, five beautiful frames on screen still carry the room.

---

## Gotchas

- **Fonts.** `document.fonts.ready` before the first draw, always. Server-side, register the font file explicitly — `@napi-rs/canvas` will not find a CSS-loaded font.
- CORS: photos from Convex file storage will taint the canvas unless served with proper headers. For local blobs, object URLs are same-origin and fine. Test the Convex-hosted path early — this bites at 5PM otherwise.
- Do not render 11 cards at full 3x on the shelf. Render at 2x, cache the bitmap, and only go 3x on export.
- iOS Safari has a canvas area cap (~16MP). A 3x 1080×1920 strip is fine; a 6x anything is not.
- Never mutate `CardRenderInput`. Path 6 may re-render the same card object repeatedly.
- Keep every colour, radius, and font size in `lib/render/theme/`. At 5PM you will want to shift the whole palette one notch warmer in ten seconds, not in forty edits.
