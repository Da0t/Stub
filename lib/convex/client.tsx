"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

/**
 * Provider + hooks wrapper (README "Files you own"). Mount this once, near
 * the root — coordinate the exact spot in app/layout.tsx with path 1, since
 * that file belongs to them.
 *
 * Requires NEXT_PUBLIC_CONVEX_URL, set once `npx convex dev` has linked a
 * project (README task list, T+0). Throws early and clearly rather than
 * failing deep inside a query hook if it's missing.
 */

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` to link a project " +
      "and populate it, then restart the dev server.",
  );
}

const convex = new ConvexReactClient(convexUrl);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
