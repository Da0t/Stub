# Path 8 — OpenAI, The Wrapped & Artist Tasks

**Branch:** `path/8-ai-wrapped-tasks`
**Mission:** Make the model earn its place — describing, never locating — and deliver the Sunday-night payoff.

> Project overview: see `README.md` on `main`. Shared types: [docs/CONTRACTS.md](docs/CONTRACTS.md). **Read the contracts, especially §9, before writing code.**

---

## Why this path exists

Two reasons, and they pull in the same direction.

**One: the event brief reads "Build with OpenAI." OpenAI usage must be visible in the pitch, not buried in a helper function.** You own all three OpenAI jobs. If the model's contribution is invisible on stage, the headline sponsor sees nothing.

**Two: we own the after.** The festival ends Sunday at 10PM and every competing product goes dark. Monday morning is unclaimed, and it is where the actual failure lives — you saw eleven artists, you loved four, and by Tuesday you remember two names and follow none of them. The artist played to 75,000 people and converted almost nothing. **The Wrapped is the fix, and it is the one thing no other team in the room is building.**

You also carry the hardest discipline on the build:

> **Deterministic code decides what happened. The model only writes the sentence around it.**
> **Model describes, never locates.**

Every other path can be sloppy and produce a worse product. If you are sloppy, you produce a *dishonest* product, and the entire defensible claim collapses. Guard this.

---

## Scope

**In**
- OpenAI vision: best-frame selection and subject classification
- OpenAI narrative: derived stats → Wrapped copy
- OpenAI task copy: artist intent → task description and reward framing
- The Wrapped experience: opening card, swipe, the read, the strip, the last card
- Artist tasks: types, verification-as-query, artist-facing form

**Out**
- Computing any stat → **path 5** (you receive `DerivedSignals`)
- Rendering cards or the strip → **path 7** (you call `renderCard` / `/api/strip`)
- Storing wrapped rows → **path 4** (you call `api.wrapped.compute`)
- Deciding where or when anything happened → **paths 2 and 5, permanently**

---

## Files you own

```
lib/ai/client.ts               OpenAI client, retry, JSON parsing
lib/ai/vision.ts               classifyBurst
lib/ai/narrative.ts            writeWrapped
lib/ai/taskCopy.ts             writeTaskCopy
lib/ai/prompts/                the three system prompts, versioned
lib/tasks/types.ts             task types + verification queries
app/wrapped/page.tsx           the Wrapped
components/wrapped/            swipe deck, stat cards, strip reveal
app/artist/page.tsx            artist task form
app/api/ai/vision/route.ts
app/api/ai/narrative/route.ts
app/api/ai/task-copy/route.ts
```

**Do not edit:** `lib/types.ts`, `lib/dwell/*`, `lib/geo/*`, `lib/render/*`, `convex/schema.ts`.

---

## 16. OpenAI usage — three jobs, all outside the fact path

### 16.1 Vision — best frame and subject

**Batched, never per-photo at capture time.** Queue and process during the resolution pass.

Input: a burst of photos from one set. Output, strict JSON:
```json
{
  "bestFrameId": "...",
  "photos": [
    { "id": "...", "subject": "stage|people|food|scenery",
      "quality": 0.0, "blurred": false }
  ]
}
```

`subject` is what makes *"you shot 43 photos of your friends and 6 of the stage"* possible. **That trait is unreachable from dwell data alone, and it is one of the lines people quote back.** It is also the clearest possible demonstration of the division of labour: the model tells us *what is in* the photo; the coordinate tells us *where it was taken*. Say that on stage.

**Prompt must specify JSON only, no preamble, no markdown fences. Parse defensively and strip fences anyway.** Use structured outputs / JSON mode if available, and still strip fences.

Failure policy: if vision fails, `bestFrame` falls back to the **first photo in the window** and `subject` stays undefined. Nothing about the card, the dwell, or the mint changes. Vision failing must be invisible to every fact on screen — verify this by running the whole demo with the OpenAI key removed.

### 16.2 Narrative — the Wrapped voice

Input is a derived-stats JSON. Output is lines.

System prompt constraints, all non-negotiable:
- **Never compute, infer, or estimate a number. Use only the numbers given.**
- **Descriptive, not evaluative.** State what happened; let it become a character.
- **No flattery.** The lines that land are the ones that sting slightly.
- Second person, present tense where possible.
- One sentence per card. No preamble.

Belt and braces: after generation, **scan the output for digits and verify every number appears in the input stats.** If a number appears that you did not supply, drop that line. This check costs ten lines of code and it is the difference between a product that is honest and a product that merely claims to be.

Have a hardcoded fallback set of lines built from the seeded stats. If the API is slow or down at 6PM, the Wrapped still runs. **Do not let a network call stand between the judges and the payoff.**

### 16.3 Task copy

Artist intent in, task description and reward framing out. Small feature, large usability gain on the artist side.

---

## 17. The Wrapped

Generated Sunday night, delivered as a notification: *your weekend is ready.*

### Structure

**Opens with an image, not a stat.** One card, framed, artist engraved. Swipe through the collection. Spotify opens with typography over gradients because it has nothing real to show. We have the actual photographs, stamped with what was playing.

**Then the read.** Derived facts only, in the app's voice:
- *You chose Hozier over three other stages Friday night.*
- *You stayed 47 minutes. You meant to stay 20.*
- *You shot 43 photos of your friends and 6 of the stage.*
- *You never once left before a set ended.*
- *Your weekend was mostly after dark.*
- *You saw four artists you had never heard of. You stayed for all four.*

**Descriptive, never evaluative.** "You shot 43 photos of your friends" is a fact that becomes a character. **A model inventing a personality verdict from nothing is where these products get cringe.** No "you're a discovery-driven explorer." Ever.

**Then the artifact.** One strip. Twelve frames across three days, single shareable image, server-rendered. This is what gets screenshotted and posted, which is why the festival wants it and why it is worth the render time.

**Last card, quiet.** The artist you spent the most time with plays Oakland in November. One tap to hear them first. Straight from JamBase tour data and the matched Spotify ID.

That last card is the business model in one screen — the artist converts a fan they would otherwise have lost by Tuesday — and it should be the *quietest* card in the deck. Do not sell it. One line, one tap.

### Implementation
- Full-screen swipe deck, one claim per card. Vertical swipe, snap scrolling.
- Each stat card maps to exactly one line and one number. If a card needs two numbers to make sense, it is two cards.
- Pre-generate everything for the seeded user before the demo. **Zero live API calls in the demo path.**
- `field_notes` frame (path 7) wraps the summary page.

---

## 12. Artist tasks

Artists assign challenges; fans complete them for rewards. This is what gives artists a reason to care, which matters for the superfan track and for the industry judges.

**Tasks are subordinate to the Wrapped, never co-equal.** They are an input that shapes what your collection looks like on Monday, not a game played during the festival. Other teams are building proximity quest products for the wait between sets — that is the during, and it is not what we are claiming. **If tasks ever start reading as the headline feature, the pitch has drifted.**

**No trivia. No scavenger hunts.** A trivia question is answerable from a couch, so it proves you looked something up, not that you were there. Presence proof is the entire defensible line and anything answerable remotely dilutes it. Every task in this system verifies one thing: **you physically stood in front of a set.**

### Task types

| Type | Verification |
|---|---|
| Attend a specific set | Card minted for that setId |
| Catch the opener | Card minted for a set with `slotIndex = 0` |
| Mint N cards in one day | Count over `mintedAt` date |
| Visit a stage you have never been to | Stage absent from prior collection |
| Full-set commitment | `completionRate ≥ 0.8` for that set |

**All verification runs on presence proof already computed.** No self-reporting, no honour system, no new code paths. **A task is a query over existing cards.** If you find yourself writing a new verification mechanism, you have taken a wrong turn — the answer is already in the `cards` table.

### Rewards
Exclusive frame variant, artist shoutout, early access, merch code. **Reward payload is opaque to the system** — just a typed blob rendered on completion. Do not build a reward engine.

### Artist-facing surface
**Minimal web form, not a CMS.** Artist picks their set, describes intent in a sentence, sets a reward. OpenAI writes the task copy and reward framing from the intent, so the artist spends thirty seconds rather than fifteen minutes.

That thirty-seconds-versus-fifteen-minutes gap is the demo. Show the form: type *"I want people to catch my opener, they always miss it"* → watch OpenAI produce the task title, description, and reward framing → save. It takes fifteen seconds on stage and it makes the OpenAI usage unmistakably visible.

---

## Task list

### T+0 → T+30 · Prompts before plumbing
- [ ] Write all three system prompts in `lib/ai/prompts/` with the constraints above stated literally.
- [ ] Test the narrative prompt by hand in the API playground against a fabricated `DerivedSignals` JSON. Iterate on voice *now*, while it is cheap.
- [ ] The voice is the product. Spend real time here, not on the client.

### T+30 → T+60 · Client + vision
- [ ] `lib/ai/client.ts` — JSON mode, retry once, defensive fence-stripping parse.
- [ ] `classifyBurst` + `/api/ai/vision`. Batch by set.
- [ ] Fallback: no vision → first photo in window, `subject` undefined.

### T+60 → T+95 · Narrative
- [ ] `writeWrapped(stats)` → `string[]`.
- [ ] **Number-verification post-check** — every digit in the output must appear in the input.
- [ ] Hardcoded fallback lines from the seeded stats, committed.

### T+95 → T+165 · The Wrapped page
- [ ] Swipe deck shell, snap scrolling, one claim per card.
- [ ] Opening card: full-bleed rendered card via path 7.
- [ ] Stat cards from the narrative lines.
- [ ] Strip reveal: call `/api/strip`, show the image, offer share/download.
- [ ] Last card: artist + Oakland tour date + Spotify tap-through, quiet styling.

### T+165 → T+195 · Artist tasks
- [ ] `lib/tasks/types.ts` — the five types, each as a query over `cards`.
- [ ] `app/artist/page.tsx` — set picker, one-sentence intent, reward type, save.
- [ ] Wire `writeTaskCopy` into the form. Show the generated copy inline before save.
- [ ] Task progress on the shelf: quiet, a line of text, not a badge shelf.

### T+195 → freeze
- [ ] Pre-generate and cache the seeded user's entire Wrapped. Verify it renders with the network off.
- [ ] Run the full demo with `OPENAI_API_KEY` unset. Every fact must still be correct; only the prose degrades to fallbacks.
- [ ] Read all six Wrapped lines out loud. If any sounds like a horoscope, cut it.

---

## Acceptance criteria

1. Vision returns strict parseable JSON for a burst of 6 photos, including when the model wraps it in fences.
2. Removing the OpenAI key changes **no number anywhere in the product** — only prose.
3. Every number in every generated line traces to a field in the input stats. The post-check catches an injected fake number.
4. No generated line is evaluative or a personality verdict.
5. The Wrapped runs end to end on the seeded user with zero live API calls.
6. The last card shows a real artist, a real Oakland date, and a working Spotify link.
7. An artist types one sentence and gets a complete task in under fifteen seconds.
8. Every task type verifies purely by querying existing cards — grep for it; there is no second verification path.

---

## Cut lines

**Tasks are first on the global cut list.** If you are behind at 4PM, cut in this order:

1. Artist task form → keep two pre-seeded tasks visible on the shelf so the concept still reads.
2. Task types → keep "attend a specific set" and "catch the opener" only.
3. Vision `subject` classification → drop the photos-of-friends line, keep best-frame.
4. Live narrative generation → ship the hardcoded lines. **Nobody in the audience can tell**, and the pre-generated ones are better anyway because you edited them.

**Never cut:** the Wrapped itself, the strip, or the last card. They are the reason this product exists.

---

## Demo responsibilities

You own the payoff and the close.

- Own the transition: *"Here is what Sunday night looks like."* **Rehearse the seam between live capture and seeded Wrapped — that transition is where demos die.** Know exactly which taps get you there and do not improvise it in front of ten judges.
- Swipe the Wrapped. Do not rush it. Let each line land — especially *"You stayed 47 minutes. You meant to stay 20."*
- Land on the strip. That is the final image.
- Own the OpenAI story out loud: *"Vision picks the best frame and tells us what's in the photo. It never decides where or when it was taken — the coordinate and the timestamp own that permanently. The model describes; it never locates."*
- Own the closing claim: *"The festival ends Sunday at 10PM and every other product goes dark. Monday morning is unclaimed. That's the part we built."*

---

## Gotchas

- The model **will** invent a number if you let it near a stat it cannot see. Pass a closed JSON object, forbid arithmetic in the prompt, and run the digit check. All three.
- JSON mode still occasionally returns fences. Strip them regardless.
- Vision on 40 photos is slow and expensive. Batch by set, cap at ~8 photos per call, and run it well outside the demo path.
- Do not let a task ever be completable by tapping a button. Verification is a query over `cards`, always.
- Resist the second-person personality verdict. "You're a night owl" is cringe; "Your weekend was mostly after dark" is a fact that becomes a character. The difference is the entire voice.
- Pre-generate. Pre-generate. A 4-second API stall in front of ten judges feels like four minutes.
