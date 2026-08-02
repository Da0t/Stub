"use client";

import { useMemo, useState } from "react";
import type { RewardType, TaskType } from "@/lib/tasks/types";
import "./artist.css";

const sets = [
  { id: "set-strokes", artistName: "The Strokes", stageId: "lands-end", startTime: 1786332000000, endTime: 1786336500000, slotIndex: 4 },
  { id: "set-charli", artistName: "Charli xcx", stageId: "lands-end", startTime: 1786245600000, endTime: 1786251000000, slotIndex: 5 },
  { id: "set-rufus", artistName: "RÜFÜS DU SOL", stageId: "lands-end", startTime: 1786159200000, endTime: 1786164600000, slotIndex: 5 },
];

const taskOptions: Array<{ value: TaskType; label: string; verification: string }> = [
  { value: "ATTEND_SET", label: "Attend this set", verification: "mint a card from this specific set" },
  { value: "CATCH_OPENER", label: "Catch the opener", verification: "mint a card from a set whose slot index is 0" },
  { value: "MINT_N_ONE_DAY", label: "Mint 3 cards in one day", verification: "mint 3 cards inside the configured festival day" },
  { value: "VISIT_NEW_STAGE", label: "Try a new stage", verification: "mint at a stage absent from the fan's prior collection" },
  { value: "FULL_SET_COMMITMENT", label: "Stay for the full set", verification: "mint this set with a completion rate of at least 0.8" },
];

const rewards: Array<{ value: RewardType; label: string }> = [
  { value: "exclusive_frame", label: "Exclusive frame" },
  { value: "artist_shoutout", label: "Artist shoutout" },
  { value: "early_access", label: "Early access" },
  { value: "merch_code", label: "Merch code" },
];

export default function ArtistPage() {
  const [setId, setSetId] = useState(sets[0].id);
  const [type, setType] = useState<TaskType>("CATCH_OPENER");
  const [intent, setIntent] = useState("I want people to catch my opener, they always miss it");
  const [rewardType, setRewardType] = useState<RewardType>("exclusive_frame");
  const [copy, setCopy] = useState<{ description: string; rewardFraming: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "writing" | "ready" | "saved">("idle");
  const selectedSet = useMemo(() => sets.find((set) => set.id === setId) ?? sets[0], [setId]);

  async function generate() {
    setStatus("writing");
    const task = taskOptions.find((option) => option.value === type) ?? taskOptions[0];
    try {
      const response = await fetch("/api/ai/task-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, set: selectedSet, rewardType, taskType: task.value }),
      });
      if (!response.ok) throw new Error("Could not write task copy");
      setCopy(await response.json());
      setStatus("ready");
    } catch {
      setCopy({
        description: `Complete this task: ${task.verification}.`,
        rewardFraming: `Complete the task to receive the selected ${rewards.find((r) => r.value === rewardType)?.label.toLowerCase()}.`,
      });
      setStatus("ready");
    }
  }

  return (
    <main className="artistShell">
      <header><span>ARTIST DESK</span><h1>A task in thirty seconds.</h1><p>You provide the intent. Existing cards provide the proof.</p></header>
      <form onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <label>Set<select value={setId} onChange={(e) => setSetId(e.target.value)}>{sets.map((set) => <option key={set.id} value={set.id}>{set.artistName}</option>)}</select></label>
        <label>Presence task<select value={type} onChange={(e) => setType(e.target.value as TaskType)}>{taskOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="wide">What do you want fans to do?<textarea maxLength={180} value={intent} onChange={(e) => setIntent(e.target.value)} /></label>
        <label>Reward<select value={rewardType} onChange={(e) => setRewardType(e.target.value as RewardType)}>{rewards.map((reward) => <option key={reward.value} value={reward.value}>{reward.label}</option>)}</select></label>
        <button type="submit" disabled={status === "writing" || !intent.trim()}>{status === "writing" ? "Writing…" : "Write the task"}</button>
      </form>
      {copy && <section className="copyPreview" aria-live="polite"><span>FAN-FACING PREVIEW</span><h2>{copy.description}</h2><p>{copy.rewardFraming}</p><button type="button" onClick={() => setStatus("saved")}>{status === "saved" ? "Saved" : "Save task"}</button><small>Completion is verified from minted cards. Fans cannot self-report it.</small></section>}
    </main>
  );
}
