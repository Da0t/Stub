import { notFound } from "next/navigation";
import type { Id } from "../../../convex/_generated/dataModel";
import { LiveDwellPanel } from "../../../components/dwell/LiveDwellPanel";
import { ConvexClientProvider } from "../../../lib/convex/client";

export default async function ConvexDwellDebugPage({ searchParams }: {
  searchParams: Promise<{ userId?: string; eventId?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { userId, eventId } = await searchParams;

  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
    <h1>Convex dwell pipeline</h1>
    <p>ingest → resolve → materialized runs → reactive query</p>
    {!userId || !eventId ? <p>Pass <code>?userId=…&amp;eventId=…</code> to inspect seeded data.</p> :
      <ConvexClientProvider><LiveDwellPanel userId={userId as Id<"users">} eventId={eventId as Id<"events">} /></ConvexClientProvider>}
    <p style={{ marginTop: 24 }}><a href="/debug/dwell">Inspect dwell arithmetic timeline</a></p>
  </main>;
}

