"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * `true` after the first client render. Used to defer UI that would
 * otherwise cause a hydration mismatch (e.g. wallet connector names that
 * depend on `window.avalanche`).
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * Renders `children` only after the client has mounted. While mounting,
 * renders `fallback` (defaults to `null`). Prefer this over scattering
 * `if (!mounted) return null` across components.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const mounted = useMounted();
  return mounted ? <>{children}</> : <>{fallback}</>;
}
