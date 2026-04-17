"use client";

import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes — matches server staleness threshold

/**
 * Extract a Convex device ID from the current pathname if on a device detail page.
 * Matches: /device/<id> and /device/<id>/settings
 */
function extractDeviceId(pathname: string): Id<"devices"> | undefined {
  const match = pathname.match(/^\/device\/([^/]+)/);
  return match ? (match[1] as Id<"devices">) : undefined;
}

/**
 * Hook that triggers on-demand reading refreshes from the EcoFlow API.
 *
 * Auto-triggers on:
 *  - Browser tab becoming visible (visibilitychange)
 *  - Window regaining focus (covers alt-tab)
 *  - SPA page navigation (pathname change)
 *
 * Rate-limited: skips if last refresh was < 2 minutes ago (client-side),
 * plus the server also checks per-device staleness before hitting the API.
 *
 * Route-aware: on /device/[id]/* pages, refreshes only that device;
 * on all other pages, refreshes all user devices.
 */
export function useOnDemandRefresh() {
  const refreshReadings = useAction(api.ecoflow.refreshReadings);
  const pathname = usePathname();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastRefreshRef = useRef(0);
  const isMountedRef = useRef(true);

  const doRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < COOLDOWN_MS) return;
    if (isRefreshing) return;

    lastRefreshRef.current = now;
    setIsRefreshing(true);

    try {
      const deviceId = extractDeviceId(pathname);
      await refreshReadings(deviceId ? { deviceId } : {});
    } catch (e) {
      console.warn("[useOnDemandRefresh] refresh failed:", e);
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [pathname, refreshReadings, isRefreshing]);

  // Track mount state to avoid setState on unmounted component
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Auto-trigger on visibility change and window focus
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        doRefresh();
      }
    };

    const handleFocus = () => {
      doRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [doRefresh]);

  // Auto-trigger on pathname change (SPA navigation)
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      doRefresh();
    }
  }, [pathname, doRefresh]);

  // Manual refresh (bypasses cooldown)
  const refresh = useCallback(async () => {
    if (isRefreshing) return;

    lastRefreshRef.current = Date.now();
    setIsRefreshing(true);

    try {
      const deviceId = extractDeviceId(pathname);
      await refreshReadings(deviceId ? { deviceId } : {});
    } catch (e) {
      console.warn("[useOnDemandRefresh] manual refresh failed:", e);
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [pathname, refreshReadings, isRefreshing]);

  return { refresh, isRefreshing };
}
