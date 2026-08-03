import { redirect } from "next/navigation";

// The demo shelf is the Claude Design artifact, now wired to the seeded
// Convex account. A server redirect prevents the older fixture shelf from
// flashing or being restored from an existing client-side cache.
export default function ShelfPage() {
  redirect("/stub-mockup/Stub.dc.html?screen=shelf");
}
