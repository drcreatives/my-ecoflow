"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useCallback, useMemo } from "react";

/**
 * Bridge hook replacing useDeviceStore for page components.
 * Wraps Convex reactive queries in the same interface the pages
 * already expect, so migration is just an import swap.
 */
export function useConvexDevices() {
  const rawDevices = useQuery(api.devices.list);
  const latestReadings = useQuery(api.readings.latest);

  const devices = useMemo(() => {
    if (!rawDevices) return [];

    // Merge latest readings onto devices so pages that expect
    // device.currentReading still work.
    return rawDevices.map((d) => {
      const rdg = latestReadings?.find((r) => r.deviceId === d.id);
      const reading = rdg?.reading ?? null;
      const isOnline = reading ? reading.status !== "offline" : false;
      return {
        ...d,
        // compat fields expected by DeviceData / DeviceStatusCard
        userId: "", // not exposed to client, placeholder for type compat
        status: isOnline
          ? reading?.batteryLevel != null && reading.batteryLevel < 20
            ? "Low Battery"
            : "Online"
          : "Offline",
        currentReading: reading,
        online: isOnline,
      };
    });
  }, [rawDevices, latestReadings]);

  return {
    devices,
    isLoading: rawDevices === undefined,
    error: null as string | null,
    // no-op: Convex queries are reactive, no manual fetch needed
    fetchDevices: useCallback(() => {}, []),
    getDeviceById: useCallback(
      (id: string) => devices.find((d) => d.id === id),
      [devices]
    ),
    getOnlineDevices: useCallback(
      () => devices.filter((d) => d.online),
      [devices]
    ),
    getActiveDevices: useCallback(
      () => devices.filter((d) => d.isActive),
      [devices]
    ),
  };
}

/**
 * Bridge hook replacing useReadingsStore for page components.
 * Wraps Convex reactive queries.
 */
export function useConvexReadings() {
  const latestReadings = useQuery(api.readings.latest);

  const readings = useMemo(() => latestReadings ?? [], [latestReadings]);

  const getLatestReading = useCallback(
    (deviceId: string) => {
      const match = readings.find((r) => r.deviceId === deviceId);
      return match?.reading ?? null;
    },
    [readings]
  );

  return {
    readings,
    isLoading: latestReadings === undefined,
    error: null as string | null,
    getLatestReading,
    // These are no-ops with Convex (reactive queries auto-refresh)
    fetchLatestForAllDevices: useCallback(() => {}, []),
    clearReadings: useCallback(() => {}, []),
    clearError: useCallback(() => {}, []),
  };
}

/**
 * Hook for fetching device readings with time range and aggregation
 * (used by the history page).
 */
export function useConvexReadingHistory(
  deviceId: string | null,
  options?: {
    startTime?: number;
    endTime?: number;
    aggregation?: "raw" | "5m" | "15m" | "1h" | "1d";
    limit?: number;
  }
) {
  const result = useQuery(
    api.readings.history,
    deviceId
      ? {
          deviceId: deviceId as Id<"devices">,
          startTime: options?.startTime ?? Date.now() - 24 * 60 * 60 * 1000,
          endTime: options?.endTime ?? Date.now(),
          aggregation: options?.aggregation,
          limit: options?.limit,
        }
      : "skip"
  );

  return {
    readings: result?.readings ?? [],
    summary: result?.summary ?? null,
    isLoading: result === undefined,
    error: null as string | null,
  };
}

/**
 * Hook for device mutations (register, unregister, update).
 */
export function useConvexDeviceMutations() {
  const createDevice = useMutation(api.devices.create);
  const updateDevice = useMutation(api.devices.update);
  const removeDevice = useMutation(api.devices.remove);

  return {
    registerDevice: useCallback(
      async (deviceSn: string, deviceName: string, deviceType?: string) => {
        return createDevice({ deviceSn, deviceName, deviceType });
      },
      [createDevice]
    ),
    updateDevice: useCallback(
      async (
        deviceId: string,
        updates: { deviceName?: string; isActive?: boolean }
      ) => {
        return updateDevice({
          deviceId: deviceId as Id<"devices">,
          ...updates,
        });
      },
      [updateDevice]
    ),
    unregisterDevice: useCallback(
      async (deviceId: string) => {
        return removeDevice({ deviceId: deviceId as Id<"devices"> });
      },
      [removeDevice]
    ),
    isLoading: false,
  };
}

/**
 * Hook for EcoFlow device discovery (used by add-device page).
 */
export function useConvexDiscover() {
  const discover = useAction(api.ecoflow.discoverDevices);
  return {
    discoverDevices: discover,
  };
}

// ─── Helper: convert timeRange string to epoch timestamps ──────────────────

function timeRangeToEpoch(timeRange: string): { startDate: number; endDate: number } {
  const now = Date.now();
  const rangeMs: Record<string, number> = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  return {
    startDate: now - (rangeMs[timeRange] ?? rangeMs["24h"]),
    endDate: now,
  };
}

/**
 * Hook wrapping the Convex readings.history query for use in history/analytics pages.
 * Accepts the same filter format the old readingsStore used.
 */
export function useConvexHistoryReadings(
  deviceId: string | null,
  filters?: {
    timeRange?: string;
    customStartDate?: string;
    customEndDate?: string;
    aggregation?: "raw" | "5m" | "15m" | "1h" | "1d";
    limit?: number;
  }
) {
  // Compute start/end dates from filter state
  const { startTime, endTime } = useMemo(() => {
    if (filters?.customStartDate && filters?.customEndDate) {
      return {
        startTime: new Date(filters.customStartDate).getTime(),
        endTime: new Date(filters.customEndDate).getTime(),
      };
    }
    const range = timeRangeToEpoch(filters?.timeRange ?? "24h");
    return { startTime: range.startDate, endTime: range.endDate };
  }, [filters?.timeRange, filters?.customStartDate, filters?.customEndDate]);

  const result = useQuery(
    api.readings.history,
    deviceId
      ? {
          deviceId: deviceId as Id<"devices">,
          startTime,
          endTime,
          aggregation: filters?.aggregation ?? "1h",
        }
      : "skip"
  );

  return {
    readings: result?.readings ?? [],
    summary: result?.summary ?? null,
    isLoading: result === undefined && deviceId !== null,
    error: null as string | null,
  };
}

/**
 * Hook for user settings (notifications, data retention, sessions).
 */
export function useConvexSettings() {
  const dataRetention = useQuery(api.settings.getDataRetention);
  const notifications = useQuery(api.settings.getNotifications);
  const session = useQuery(api.settings.getSession);

  const updateDataRetention = useMutation(api.settings.updateDataRetention);
  const updateNotifications = useMutation(api.settings.updateNotifications);
  const updateSession = useMutation(api.settings.updateSession);

  return {
    dataRetention: dataRetention ?? null,
    notifications: notifications ?? null,
    session: session ?? null,
    isLoading:
      dataRetention === undefined ||
      notifications === undefined ||
      session === undefined,
    updateDataRetention,
    updateNotifications,
    updateSession,
  };
}

/**
 * Hook for user profile (name, email via Convex auth).
 */
export function useConvexProfile() {
  const profile = useQuery(api.users.getProfile);
  const updateProfile = useMutation(api.users.updateProfile);

  return {
    profile: profile ?? null,
    isLoading: profile === undefined,
    updateProfile,
  };
}
