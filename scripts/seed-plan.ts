/**
 * Pure planning logic for the demo weekend — zero Convex dependency on
 * purpose, so it can be unit tested (scripts/__tests__/seed-plan.test.ts)
 * without a linked deployment or codegen. seed-demo.ts does the I/O
 * (writing these picks into Convex); this file only decides what to pick.
 */

import type { Grid, SetRecord, Stage } from "../lib/types";

export function buildFallbackGrid(): Grid {
  // Approximate Golden Gate Park coordinates, small placeholder polygons.
  // Fictional artist names on purpose — this is scaffolding, not a claim
  // about the real 2026 lineup (path 3 owns that fact).
  const stageNames = ["Lands End", "Twin Peaks", "Sutro", "SOMA", "Duboce Triangle"];
  const baseLat = 37.7694;
  const baseLng = -122.4862;

  const stages: Stage[] = stageNames.map((name, i) => {
    const lat = baseLat + i * 0.0015;
    const lng = baseLng + (i % 2 === 0 ? 0.001 : -0.001) * i;
    return {
      id: `fixture-stage-${i}`,
      name,
      polygon: [
        [lat - 0.0006, lng - 0.0006],
        [lat - 0.0006, lng + 0.0006],
        [lat + 0.0006, lng + 0.0006],
        [lat + 0.0006, lng - 0.0006],
      ],
      bufferMeters: name === "Duboce Triangle" ? 45 : 25,
      centroid: [lat, lng],
    };
  });

  const dayStarts = [
    Date.UTC(2026, 7, 7, 19), // Fri Aug 7, noon PT bootstrap; 19:00 UTC = 12:00 PT
    Date.UTC(2026, 7, 8, 19),
    Date.UTC(2026, 7, 9, 19),
  ];
  const artistFirstNames = [
    "Fixture",
    "Placeholder",
    "Synth",
    "Stand-in",
    "Draft",
    "Sample",
    "Working",
    "Interim",
    "Proxy",
    "Sketch",
    "Prelim",
    "Mock",
  ];

  const sets: SetRecord[] = [];
  const slotCursor: Record<string, number> = {};
  let artistIdx = 0;
  for (const dayStart of dayStarts) {
    for (let hourOffset = 0; hourOffset <= 9; hourOffset += 1.5) {
      for (const stage of stages) {
        const startTime = dayStart + hourOffset * 60 * 60 * 1000;
        const durationMin = 75;
        const slotIndex = slotCursor[stage.id] ?? 0;
        slotCursor[stage.id] = slotIndex + 1;
        sets.push({
          id: `fixture-set-${sets.length}`,
          stageId: stage.id,
          artistName: `${artistFirstNames[artistIdx % artistFirstNames.length]} Artist ${artistIdx}`,
          startTime,
          endTime: startTime + durationMin * 60 * 1000,
          slotIndex,
          isHeadliner: hourOffset >= 7.5,
          estimatedAudience: 5000 + artistIdx * 137,
          isFestivalDebut: artistIdx % 5 === 0,
          isFinalShow: false,
          genreTags: ["indie"],
          jambaseArtistId: null,
          spotifyId: null,
          nextTourDate: null,
        });
        artistIdx += 1;
      }
    }
  }

  return {
    festivalId: "fixture-outside-lands-2026",
    eventName: "Outside Lands 2026 (dev fixture)",
    timezone: "America/Los_Angeles",
    fetchedAt: Date.now(),
    stages,
    sets,
  };
}

// ---------------------------------------------------------------------------
// Seed plan: pick which sets the demo user "attended", satisfying the spec.
// ---------------------------------------------------------------------------

export interface AttendedSet {
  set: SetRecord;
  stage: Stage;
  dwellSeconds: number;
  gapAt?: "middle"; // this run gets a >5min gap inserted
}

export interface SeedPlan {
  attended: AttendedSet[];
  fridayNightSkipSetId: string;
  priorArtistNames: string[]; // 7 of the 11 attended artists, minted in a prior event
}

export function buildSeedPlan(grid: Grid): SeedPlan {
  const sets = [...grid.sets].sort((a, b) => a.startTime - b.startTime);
  const stageById = new Map(grid.stages.map((s) => [s.id, s]));

  // Group by festival-local day.
  const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: grid.timezone, dateStyle: "short" });
  const byDay = new Map<string, SetRecord[]>();
  for (const s of sets) {
    const key = dayFmt.format(new Date(s.startTime));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const days = [...byDay.keys()].slice(0, 3);

  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: grid.timezone,
    hour: "numeric",
    hour12: false,
  });
  const localHour = (ts: number) => Number(hourFmt.format(new Date(ts)));
  const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: grid.timezone, weekday: "short" });
  const localWeekday = (ts: number) => weekdayFmt.format(new Date(ts));

  // A single attendee can only be in one place at a time: two chosen sets
  // must never overlap in time, no matter which stages they're on. Skipping
  // this check was a real bug — it let the planner pick two concurrent
  // sets on different stages and then generate simulated dwell presence at
  // both simultaneously, which corrupts buildDwellRuns' contiguous-run
  // grouping (a real user's sample stream is never in two places at once,
  // so path 5's algorithm doesn't need to and doesn't handle it).
  const overlapsAny = (candidate: SetRecord, picked: SetRecord[]) =>
    picked.some((p) => candidate.startTime < p.endTime && candidate.endTime > p.startTime);

  // Pick 11 sets, night-weighted, spread across stages: for each day, take
  // an even split from that day's target count, walking stages in rotation
  // (round-robin) so consecutive picks vary rather than clustering on one
  // stage. Evening sets preferred per-day when there are enough of them.
  const TARGET_TOTAL = 11;
  const chosen: SetRecord[] = [];
  for (let d = 0; d < days.length; d++) {
    const daySets = byDay.get(days[d])!;
    const evening = daySets.filter((s) => localHour(s.startTime) >= 18);
    const pool = (evening.length >= 3 ? evening : daySets).slice().sort((a, b) => a.startTime - b.startTime);

    const remainingDays = days.length - d;
    const target = Math.min(pool.length, Math.ceil((TARGET_TOTAL - chosen.length) / remainingDays));

    const byStage = new Map<string, SetRecord[]>();
    for (const s of pool) {
      const key = s.stageId;
      if (!byStage.get(key)) byStage.set(key, []);
      byStage.get(key)!.push(s);
    }
    const stageKeys = [...byStage.keys()];
    let stageCursor = 0;
    let picked = 0;
    let spins = 0;
    while (picked < target && stageKeys.length > 0 && spins <= stageKeys.length * pool.length) {
      spins++;
      const key = stageKeys[stageCursor % stageKeys.length];
      const bucket = byStage.get(key)!;
      stageCursor++;

      // Earliest still-available set on this stage that doesn't overlap an
      // already-chosen set. Bucket is chronological, so the first hit is
      // also the earliest — no need to scan past it.
      const idx = bucket.findIndex((s) => !overlapsAny(s, chosen));
      if (idx === -1) continue; // nothing usable left on this stage right now
      const [s] = bucket.splice(idx, 1);
      chosen.push(s);
      picked++;
    }
  }

  // Backfill from the full grid (any day, any hour) if the evening-preferred
  // pools couldn't reach the target — concurrency collapses an evening's
  // worth of same-slot cross-stage sets down to one pickable slot each, so
  // a grid with few evening slots can hit that ceiling well under 11.
  if (chosen.length < TARGET_TOTAL) {
    for (const s of sets) {
      if (chosen.length >= TARGET_TOTAL) break;
      if (!chosen.includes(s) && !overlapsAny(s, chosen)) chosen.push(s);
    }
  }
  const attendedSets = chosen.slice(0, TARGET_TOTAL);

  // Ensure >= 4 distinct stages: if the round-robin above landed on fewer,
  // swap in sets from missing stages — but only a candidate that doesn't
  // newly overlap another already-attended set.
  let distinctStages = new Set(attendedSets.map((s) => stageById.get(s.stageId)?.name));
  if (distinctStages.size < 4) {
    for (const s of sets) {
      if (distinctStages.size >= 4) break;
      const name = stageById.get(s.stageId)?.name;
      const others = attendedSets.slice(0, -1);
      if (name && !distinctStages.has(name) && !attendedSets.includes(s) && !overlapsAny(s, others)) {
        attendedSets[attendedSets.length - 1] = s;
        distinctStages = new Set(attendedSets.map((x) => stageById.get(x.stageId)?.name));
      }
    }
  }

  // Friday-night set with the most concurrent overlaps, for the opportunity
  // cost headline. Falls back to "most overlaps of any attended set" if the
  // grid has no Friday data (e.g. a partial real pull).
  const overlapCount = (s: SetRecord) =>
    sets.filter((o) => o.id !== s.id && o.startTime < s.endTime && o.endTime > s.startTime).length;

  const fridayNightCandidates = attendedSets.filter(
    (s) => localWeekday(s.startTime) === "Fri" && localHour(s.startTime) >= 19,
  );
  const skipCandidatePool = fridayNightCandidates.length > 0 ? fridayNightCandidates : attendedSets;
  const fridayNightSkipSet = skipCandidatePool.reduce((best, s) =>
    overlapCount(s) > overlapCount(best) ? s : best,
  );
  if (overlapCount(fridayNightSkipSet) < 3) {
    console.warn(
      `Best available "concurrent sets skipped" set only has ${overlapCount(fridayNightSkipSet)} ` +
        `overlapping sets (spec wants >= 3). The provided grid may be too sparse on Friday night.`,
    );
  }

  // Dwell per attended set: mostly clean, one deliberately uneven (README:
  // "perfectly clean data looks fake"), one with the 47-minute headline,
  // one carrying the >5min gap.
  const attended: AttendedSet[] = attendedSets.map((set, i) => {
    const durationSec = (set.endTime - set.startTime) / 1000;
    let dwellSeconds: number;
    if (set.id === fridayNightSkipSet.id) {
      dwellSeconds = Math.min(durationSec, 47 * 60); // the headline stay
    } else if (i === 1) {
      dwellSeconds = Math.round(durationSec * 0.72); // left 8ish minutes early
    } else if (i === 4) {
      dwellSeconds = Math.round(durationSec * 0.55); // gap set, see below
    } else {
      dwellSeconds = Math.round(durationSec * (0.85 + (i % 3) * 0.05)); // uneven, not exactly clean
    }
    return {
      set,
      stage: stageById.get(set.stageId)!,
      dwellSeconds: Math.min(dwellSeconds, durationSec),
      gapAt: i === 4 ? "middle" : undefined,
    };
  });

  // Discovery: 4 artists with no prior card. The other 7 get a card minted
  // in a synthetic prior event below.
  const priorArtistNames = attended.slice(4).map((a) => a.set.artistName);

  return { attended, fridayNightSkipSetId: fridayNightSkipSet.id, priorArtistNames };
}

export function logPlanSummary(plan: SeedPlan) {
  console.log(`Attending ${plan.attended.length} sets:`);
  for (const a of plan.attended) {
    console.log(
      `  - ${a.set.artistName} @ ${a.stage.name} (${Math.round(a.dwellSeconds / 60)} min` +
        `${a.set.id === plan.fridayNightSkipSetId ? ", opportunity-cost headline" : ""}` +
        `${a.gapAt ? ", has a >5min gap" : ""})`,
    );
  }
  console.log(`Discoveries (no prior card): ${plan.attended.length - plan.priorArtistNames.length}`);
}
