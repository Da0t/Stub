import type { DwellSample, Grid } from "../../types";

export const minute = 60_000;
export const base = Date.parse("2026-08-08T01:00:00Z");

const setDefaults = { slotIndex: 0, isHeadliner: false, estimatedAudience: null, isFestivalDebut: false, isFinalShow: false, genreTags: [], jambaseArtistId: null, spotifyId: null, nextTourDate: null };
export const grid = {
  festivalId: "fixture", eventName: "Fixture Festival", timezone: "America/Los_Angeles", fetchedAt: base,
  stages: [
    { id: "main", name: "Main", polygon: [[0.99, 0.99], [0.99, 1.01], [1.01, 1.01], [1.01, 0.99]], bufferMeters: 0, centroid: [1, 1] },
    { id: "side", name: "Side", polygon: [[1.99, 1.99], [1.99, 2.01], [2.01, 2.01], [2.01, 1.99]], bufferMeters: 0, centroid: [2, 2] },
  ],
  sets: [
    { ...setDefaults, id: "main-1", stageId: "main", artistName: "First", startTime: base, endTime: base + 75 * minute },
    { ...setDefaults, id: "main-2", stageId: "main", artistName: "Second", startTime: base + 75 * minute, endTime: base + 135 * minute },
    { ...setDefaults, id: "side-1", stageId: "side", artistName: "Alternative", startTime: base, endTime: base + 60 * minute },
  ],
} as Grid;

export function sample(id: string, offsetMinutes: number, lat = 1): DwellSample {
  return { clientId: id, ts: base + offsetMinutes * minute, lat, lng: lat, accuracy: 10, synced: false };
}

export const clean45 = Array.from({ length: 46 }, (_, index) => sample(`clean-${index}`, index));
export const twelveMinuteGap = [sample("gap-0", 0), sample("gap-1", 4), sample("gap-2", 16), sample("gap-3", 20)];
export const spanningSets = [sample("span-0", 70), sample("span-1", 74), sample("span-2", 76), sample("span-3", 80)];
export const offStageBreak = [sample("off-0", 0), sample("off-1", 2), sample("wine", 3, 0), sample("off-2", 4), sample("off-3", 6)];
