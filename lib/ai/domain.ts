/** Structural subsets of the shared contracts. They remain assignable from lib/types.ts. */
export interface SetForCopy {
  id: string;
  artistName: string;
  stageId: string;
  startTime: number;
  endTime: number;
  slotIndex: number;
}

export interface WrappedStats {
  totalDwellSeconds: number;
  setsAttended: number;
  concurrentSetsSkipped: number;
  perSetSkipped: Record<string, number>;
  completionRateAvg: number;
  fullSetCount: number;
  stageDiversity: number;
  nightRatio: number;
  discoveryRate: number;
  longestRun: unknown | null;
  topArtistBySetTime: { setId: string; artistName: string; dwellSeconds: number } | null;
  extras: Record<string, unknown>;
}
