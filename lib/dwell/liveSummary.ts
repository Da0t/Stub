import { ATTENDED_SECONDS, MINT_ELIGIBLE_SECONDS } from "./thresholds";

export const CURRENT_RUN_RECENCY_MS = 5 * 60_000;
export interface LiveSet { id: string; stageId: string; artistName: string; startTime: number; endTime: number }
export interface LiveStage { id: string; name: string }
export interface LiveRun { userId?: string; setId: string; stageId: string; startTs: number; endTs: number; dwellSeconds: number }
export interface AttendedSet { setId: string; stageId: string; artistName: string; stageName: string; dwellSeconds: number; completionRate: number; minted: boolean }
export interface LiveDwellSummary {
  eventId: string;
  processing: "IDLE" | "RESOLVING" | "READY";
  sampleCount: number;
  unresolvedSampleCount: number;
  runCount: number;
  totalDwellSeconds: number;
  current: (AttendedSet & { mintEligible: boolean }) | null;
  attendedSets: AttendedSet[];
  updatedAt: number | null;
}
export interface EventDwellLeaderboard {
  topArtists: Array<{ setId: string; artistName: string; attendeeCount: number; totalDwellSeconds: number }>;
  topStages: Array<{ stageId: string; stageName: string; attendeeCount: number; totalDwellSeconds: number }>;
}
export interface LiveSummaryInput {
  eventId: string;
  samples: Array<{ timestamp: number; resolved: boolean }>;
  runs: LiveRun[];
  sets: LiveSet[];
  stages: LiveStage[];
  photoSetIds: Set<string>;
  mintedSetIds: Set<string>;
}

export function summarizeLiveDwell(input: LiveSummaryInput): LiveDwellSummary {
  const updatedAt = input.samples.reduce<number | null>((latest, sample) => latest === null || sample.timestamp > latest ? sample.timestamp : latest, null);
  const unresolvedSampleCount = input.samples.filter((sample) => !sample.resolved).length;
  const sets = new Map(input.sets.map((set) => [set.id, set]));
  const stages = new Map(input.stages.map((stage) => [stage.id, stage]));
  const aggregated = new Map<string, { dwellSeconds: number; endTs: number }>();

  for (const run of input.runs) {
    const prior = aggregated.get(run.setId);
    aggregated.set(run.setId, { dwellSeconds: (prior?.dwellSeconds ?? 0) + run.dwellSeconds, endTs: Math.max(prior?.endTs ?? -Infinity, run.endTs) });
  }

  const projected = [...aggregated].flatMap(([setId, aggregate]) => {
    const set = sets.get(setId);
    if (!set) return [];
    const durationSeconds = Math.max(0, (set.endTime - set.startTime) / 1000);
    return [{
      setId,
      stageId: set.stageId,
      artistName: set.artistName,
      stageName: stages.get(set.stageId)?.name ?? "Unknown stage",
      dwellSeconds: aggregate.dwellSeconds,
      completionRate: durationSeconds === 0 ? 0 : Math.min(1, aggregate.dwellSeconds / durationSeconds),
      minted: input.mintedSetIds.has(setId),
      endTs: aggregate.endTs,
    }];
  }).sort((a, b) => b.endTs - a.endTs || a.artistName.localeCompare(b.artistName));

  const latest = projected[0];
  const current = latest && updatedAt !== null && updatedAt >= latest.endTs && updatedAt - latest.endTs <= CURRENT_RUN_RECENCY_MS
    ? { ...withoutEndTs(latest), mintEligible: latest.dwellSeconds >= MINT_ELIGIBLE_SECONDS && input.photoSetIds.has(latest.setId) && !latest.minted }
    : null;

  return {
    eventId: input.eventId,
    processing: input.samples.length === 0 ? "IDLE" : unresolvedSampleCount > 0 ? "RESOLVING" : "READY",
    sampleCount: input.samples.length,
    unresolvedSampleCount,
    runCount: input.runs.length,
    totalDwellSeconds: input.runs.reduce((sum, run) => sum + run.dwellSeconds, 0),
    current,
    attendedSets: projected.filter((set) => set.dwellSeconds >= ATTENDED_SECONDS).map(withoutEndTs),
    updatedAt,
  };
}

export function buildEventLeaderboard(input: { runs: LiveRun[]; sets: LiveSet[]; stages: LiveStage[] }, requestedLimit = 5): EventDwellLeaderboard {
  const limit = Math.min(20, Math.max(1, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 5));
  const sets = new Map(input.sets.map((set) => [set.id, set]));
  const stages = new Map(input.stages.map((stage) => [stage.id, stage]));
  const artists = new Map<string, { setId: string; artistName: string; users: Set<string>; totalDwellSeconds: number }>();
  const stageTotals = new Map<string, { stageId: string; stageName: string; users: Set<string>; totalDwellSeconds: number }>();

  for (const run of input.runs) {
    const set = sets.get(run.setId);
    if (!set) continue;
    const userId = run.userId ?? "anonymous";
    const artist = artists.get(set.id) ?? { setId: set.id, artistName: set.artistName, users: new Set(), totalDwellSeconds: 0 };
    artist.users.add(userId);
    artist.totalDwellSeconds += run.dwellSeconds;
    artists.set(set.id, artist);
    const stage = stageTotals.get(set.stageId) ?? { stageId: set.stageId, stageName: stages.get(set.stageId)?.name ?? "Unknown stage", users: new Set(), totalDwellSeconds: 0 };
    stage.users.add(userId);
    stage.totalDwellSeconds += run.dwellSeconds;
    stageTotals.set(set.stageId, stage);
  }

  const rank = <T extends { totalDwellSeconds: number }>(values: T[], name: (value: T) => string) => values.sort((a, b) => b.totalDwellSeconds - a.totalDwellSeconds || name(a).localeCompare(name(b))).slice(0, limit);
  return {
    topArtists: rank([...artists.values()], (row) => row.artistName).map(({ users, ...row }) => ({ ...row, attendeeCount: users.size })),
    topStages: rank([...stageTotals.values()], (row) => row.stageName).map(({ users, ...row }) => ({ ...row, attendeeCount: users.size })),
  };
}

function withoutEndTs<T extends AttendedSet & { endTs: number }>({ endTs: _endTs, ...set }: T): AttendedSet { return set; }

