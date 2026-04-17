"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useCallback, useMemo, useRef, useState } from "react";

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
  }
) {
  // Memoize default time window so unrelated re-renders don't produce new
  // Date.now() values that trigger fresh Convex queries (extra bandwidth).
  const defaultTimesRef = useRef({
    startTime: Date.now() - 24 * 60 * 60 * 1000,
    endTime: Date.now(),
  });

  const result = useQuery(
    api.readings.history,
    deviceId
      ? {
          deviceId: deviceId as Id<"devices">,
          startTime: options?.startTime ?? defaultTimesRef.current.startTime,
          endTime: options?.endTime ?? defaultTimesRef.current.endTime,
          aggregation: options?.aggregation,
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
    // Cap to current time — the server-side query also caps to Date.now().
    // This prevents reactive re-execution when new readings are inserted,
    // which was the #1 source of DB bandwidth consumption.
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

/**
 * Hook for device control actions (SET commands).
 * Provides typed wrappers for all EcoFlow SET operations.
 */
export function useConvexDeviceControl() {
  const setPortState = useAction(api.ecoflow.setPortState);
  const setAcConfig = useAction(api.ecoflow.setAcConfig);
  const setChargingConfig = useAction(api.ecoflow.setChargingConfig);
  const setStandbyTimers = useAction(api.ecoflow.setStandbyTimers);
  const setLcdConfig = useAction(api.ecoflow.setLcdConfig);
  const setEnergyManagement = useAction(api.ecoflow.setEnergyManagement);
  const setBmsConfig = useAction(api.ecoflow.setBmsConfig);
  const setSmartGenerator = useAction(api.ecoflow.setSmartGenerator);
  const setBuzzer = useAction(api.ecoflow.setBuzzer);

  const [isLoading, setIsLoading] = useState(false);

  const wrapAction = useCallback(
    <T extends (...args: never[]) => Promise<unknown>>(fn: T) => {
      return async (...args: Parameters<T>) => {
        setIsLoading(true);
        try {
          return await fn(...args);
        } finally {
          setIsLoading(false);
        }
      };
    },
    []
  );

  return {
    setPortState: useMemo(() => wrapAction(setPortState), [wrapAction, setPortState]),
    setAcConfig: useMemo(() => wrapAction(setAcConfig), [wrapAction, setAcConfig]),
    setChargingConfig: useMemo(() => wrapAction(setChargingConfig), [wrapAction, setChargingConfig]),
    setStandbyTimers: useMemo(() => wrapAction(setStandbyTimers), [wrapAction, setStandbyTimers]),
    setLcdConfig: useMemo(() => wrapAction(setLcdConfig), [wrapAction, setLcdConfig]),
    setEnergyManagement: useMemo(() => wrapAction(setEnergyManagement), [wrapAction, setEnergyManagement]),
    setBmsConfig: useMemo(() => wrapAction(setBmsConfig), [wrapAction, setBmsConfig]),
    setSmartGenerator: useMemo(() => wrapAction(setSmartGenerator), [wrapAction, setSmartGenerator]),
    setBuzzer: useMemo(() => wrapAction(setBuzzer), [wrapAction, setBuzzer]),
    isLoading,
  };
}

/**
 * Hook for device schedule CRUD.
 */
export function useConvexSchedules(deviceId: string | null) {
  const schedules = useQuery(
    api.schedules.list,
    deviceId ? { deviceId: deviceId as Id<"devices"> } : "skip"
  );
  const createSchedule = useMutation(api.schedules.create);
  const updateSchedule = useMutation(api.schedules.update);
  const removeSchedule = useMutation(api.schedules.remove);

  return {
    schedules: schedules ?? [],
    isLoading: schedules === undefined && deviceId !== null,
    createSchedule: useCallback(
      async (args: {
        deviceId: string;
        name: string;
        time: string;
        daysOfWeek: number[];
        action: { moduleType: number; operateType: string; params: Record<string, unknown> };
        timezone: string;
      }) => {
        return createSchedule({
          ...args,
          deviceId: args.deviceId as Id<"devices">,
        });
      },
      [createSchedule]
    ),
    updateSchedule: useCallback(
      async (args: {
        scheduleId: string;
        name?: string;
        enabled?: boolean;
        time?: string;
        daysOfWeek?: number[];
        action?: { moduleType: number; operateType: string; params: Record<string, unknown> };
        timezone?: string;
      }) => {
        return updateSchedule({
          ...args,
          scheduleId: args.scheduleId as Id<"deviceSchedules">,
        });
      },
      [updateSchedule]
    ),
    removeSchedule: useCallback(
      async (scheduleId: string) => {
        return removeSchedule({
          scheduleId: scheduleId as Id<"deviceSchedules">,
        });
      },
      [removeSchedule]
    ),
  };
}
