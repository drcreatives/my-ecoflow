"use client";

import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { notifyReadingWindowRefresh } from "@/lib/reading-refresh-events";

const COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Extract a Convex device ID from the current pathname if on a device detail page.
 * Matches: /device/<id> and /device/<id>/settings
 */
function extractDeviceId(pathname: string): Id<"devices"> | undefined {
  const match = pathname.match(/^\/device\/([^/]+)/);
  return match ? (match[1] as Id<"devices">) : undefined;
}

interface RefreshResult {
  success: boolean;
  devicesRefreshed: number;
  devicesSkipped: number;
  devicesFresh: number;
  devicesRateLimited: number;
  devicesOffline: number;
  devicesFailed: number;
  devicesBusy?: number;
  retryAfterMs: number;
}

function showRefreshResult(result: RefreshResult) {
  const details: string[] = [];
  if (result.devicesRefreshed) details.push(`${result.devicesRefreshed} fetched`);
  if (result.devicesFresh) details.push(`${result.devicesFresh} already recent`);
  if (result.devicesBusy) details.push(`${result.devicesBusy} already collecting; readings will update when ready`);
  if (result.devicesRateLimited) {
    const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    details.push(`${result.devicesRateLimited} rate-limited (try again in ${seconds} seconds)`);
  }
  const inactive = result.devicesSkipped - result.devicesFresh - result.devicesRateLimited - (result.devicesBusy ?? 0);
  if (inactive > 0) details.push(`${inactive} inactive skipped`);
  if (result.devicesOffline) details.push(`${result.devicesOffline} offline`);
  if (result.devicesFailed) details.push(`${result.devicesFailed} failed`);
  const description = details.length ? details.join("; ") : "No active devices to refresh.";

  if (!result.success) {
    toast.error("Refresh incomplete", { description });
  } else if (result.devicesRefreshed > 0) {
    toast.success("Readings fetched", { description });
  } else {
    toast.info("No new readings fetched", { description });
  }
}

/**
 * Fetch on authenticated layout mount, focus, visibility and navigation.
 * Automatic requests share a two-minute cooldown per device/all-device scope.
 * Manual fetches bypass the recent-reading check; the server still atomically
 * rate-limits requests. A fetched row is not proof of a fresh device measurement.
 */
export function useOnDemandRefresh() {
  const refreshReadings = useAction(api.ecoflow.refreshReadings);
  const pathname = usePathname();
  const deviceId = extractDeviceId(pathname);
  const scope = deviceId ?? "all";
  const [pendingCount, setPendingCount] = useState(0);
  const lastSuccessByScopeRef = useRef(new Map<string, number>());
  const pendingScopesRef = useRef(new Set<string>());
  const isMountedRef = useRef(true);

  const doRefresh = useCallback(async (manual = false) => {
    if (pendingScopesRef.current.has(scope)) return;
    const lastSuccess = lastSuccessByScopeRef.current.get(scope);
    if (!manual && lastSuccess !== undefined && Date.now() - lastSuccess < COOLDOWN_MS) return;

    // Guard synchronously: focus/visibility/manual events may arrive together
    // before React has rerendered the pending UI state.
    pendingScopesRef.current.add(scope);
    setPendingCount(count => count + 1);
    try {
      const result = await refreshReadings({
        ...(deviceId ? { deviceId } : {}),
        ...(manual ? { force: true } : {}),
      });
      if (result.success) {
        lastSuccessByScopeRef.current.set(scope, Date.now());
      } else {
        lastSuccessByScopeRef.current.delete(scope);
      }
      if (isMountedRef.current) {
        if (result.success || result.devicesRefreshed > 0) notifyReadingWindowRefresh(deviceId);
        if (manual) showRefreshResult(result);
      }
    } catch {
      lastSuccessByScopeRef.current.delete(scope);
      if (manual && isMountedRef.current) {
        toast.error("Unable to fetch readings. Please try again.");
      }
    } finally {
      pendingScopesRef.current.delete(scope);
      if (isMountedRef.current) setPendingCount(count => count - 1);
    }
  }, [deviceId, refreshReadings, scope]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    const handleReturn = () => {
      notifyReadingWindowRefresh(deviceId);
      void doRefresh();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleReturn();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleReturn);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleReturn);
    };
  }, [deviceId, doRefresh]);

  useEffect(() => {
    notifyReadingWindowRefresh(deviceId);
    void doRefresh();
  }, [pathname, deviceId, doRefresh]);

  const refresh = useCallback(async () => {
    notifyReadingWindowRefresh(deviceId);
    await doRefresh(true);
  }, [deviceId, doRefresh]);

  return { refresh, isRefreshing: pendingCount > 0 && pendingScopesRef.current.has(scope) };
}
