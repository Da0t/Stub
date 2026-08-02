import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "complete ended events",
  { minutes: 15 },
  internal.eventCompletion.scanEndedEvents,
);

export default crons;
