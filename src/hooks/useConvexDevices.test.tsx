import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { useLayoutEffect, type ReactNode } from "react";
import { useConvexDevices, useConvexReadings } from "./useConvexData";
import type { InputSourceReading } from '@/lib/reading-status';
import type { DisplayTelemetry } from '@/types';
import { getTemperatureAge, resolveTemperatureMetric } from '@/lib/display-telemetry';

// Existing feature coverage remains runnable when temperature is re-enabled.
const temperatureFeature = vi.hoisted(() => ({ enabled: true }))
vi.mock('@/lib/features', () => ({ get TEMPERATURE_FEATURE_ENABLED() { return temperatureFeature.enabled } }))
beforeEach(() => { temperatureFeature.enabled = true })

const mockState = vi.hoisted(() => ({
  status: null as "online" | "offline" | "error" | null,
  recordedAt: 0,
  interval: 1,
  source: {} as InputSourceReading,
  displayTelemetry: null as DisplayTelemetry | null,
  temperatureRefreshing: false,
  queryArgs: [] as unknown[],
}));
vi.mock("convex/react", () => ({
  useQuery: vi.fn((reference: Parameters<typeof getFunctionName>[0], args?: unknown) => {
    mockState.queryArgs.push(args);
    switch (getFunctionName(reference)) {
      case "devices:list": return [{ id: "device", deviceName: "Power station", deviceSn: "TEST", isActive: true, connectionStatus: mockState.status, displayTelemetry: mockState.displayTelemetry, temperatureRefreshing: mockState.temperatureRefreshing }];
      case "readings:latest": return [{ deviceId: "device", reading: { recordedAt: mockState.recordedAt, batteryLevel: 80, status: "charging", ...mockState.source } }];
      case "settings:getDataRetention": return { collectionIntervalMinutes: mockState.interval };
      default: return undefined;
    }
  }),
  useAction: vi.fn(), useMutation: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_790_000_000_000);
  mockState.status = "online"; mockState.interval = 1; mockState.recordedAt = Date.now();
  mockState.source = {};
  mockState.displayTelemetry = null;
  mockState.temperatureRefreshing = false;
  mockState.queryArgs = [];
});
afterEach(() => { vi.useRealTimers(); });

describe("device telemetry health", () => {
  it('should preserve independent panel evidence and unclassified station channels through both latest-reading bridges', () => {
    mockState.source = {
      inputWatts: 221, acInputWatts: null, dcInputWatts: null, solarInputWatts: null,
      inputQuality: 'incomplete', inputMeasurement: null, powerMeasurement: 'pd-totals-mqtt-v1',
      solarPanelInputWatts: 226, solarPanelReceivedAt: Date.now() + 1_000, solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
    };
    const { result } = renderHook(() => ({ device: useConvexDevices().devices[0], latest: useConvexReadings().getLatestReading('device') }));
    expect(result.current.device.currentReading).toMatchObject(mockState.source);
    expect(result.current.latest).toMatchObject(mockState.source);
    expect(result.current.device.online).toBe(true);
  });

  it('should advance a compact age label without fetching or changing its exact report time', async () => {
    const receivedAt = Date.now();
    mockState.displayTelemetry = { temperature: { value: 37, receivedAt, source: 'mqtt' } };
    const { result } = renderHook(() => {
      const device = useConvexDevices().devices[0];
      const metric = resolveTemperatureMetric(device.displayTelemetry?.temperature);
      return { metric, age: getTemperatureAge(metric) };
    });
    expect(result.current.age.label).toBe('Just now');
    await act(async () => { vi.advanceTimersByTime(60_001); });
    expect(result.current.age.label).toBe('1 min ago');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(result.current.age.label).toBe('2 min ago');
    expect(result.current.metric.receivedAt).toBe(receivedAt);
    expect(mockState.queryArgs.every(args => args === undefined)).toBe(true);
  });

  it('should update an age boundary that passes between render and passive effects', async () => {
    mockState.displayTelemetry = { temperature: { value: 37, receivedAt: Date.now(), source: 'mqtt' } };
    function DelayPassiveEffects({ children }: { children: ReactNode }) {
      useLayoutEffect(() => { vi.advanceTimersByTime(60_001); }, []);
      return children;
    }
    const { result } = renderHook(() => {
      const device = useConvexDevices().devices[0];
      return getTemperatureAge(resolveTemperatureMetric(device.displayTelemetry?.temperature));
    }, { wrapper: DelayPassiveEffects });
    expect(result.current.label).toBe('Just now');
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(result.current.label).toBe('1 min ago');
  });

  it('should update temperature freshness after six minutes without changing query arguments or power health', async () => {
    const receivedAt = Date.now();
    mockState.interval = 15;
    mockState.temperatureRefreshing = true;
    mockState.displayTelemetry = { temperature: { value: 39, receivedAt, source: 'mqtt' } };
    const { result } = renderHook(() => {
      const device = useConvexDevices().devices[0];
      return { device, temperature: resolveTemperatureMetric(device.displayTelemetry?.temperature) };
    });
    expect(result.current.temperature.status).toBe('reported');
    expect(result.current.device.temperatureRefreshing).toBe(true);
    await act(async () => { vi.advanceTimersByTime(6 * 60_000 + 1); });
    expect(result.current.temperature).toMatchObject({ value: 39, receivedAt, status: 'stale' });
    expect(result.current.device.online).toBe(true);
    expect(mockState.queryArgs.every(args => args === undefined)).toBe(true);
  });
  it('should keep display-only cached fields separate from collected readings and freshness', () => {
    mockState.displayTelemetry = {
      temperature: { value: 24, receivedAt: Date.now() + 1_000, source: 'rest-cache' },
      acOutputWatts: { value: 110, receivedAt: Date.now() + 1_000, source: 'mqtt' },
    };
    const { result } = renderHook(() => ({ devices: useConvexDevices().devices, latest: useConvexReadings().getLatestReading('device') }));
    expect(result.current.devices[0].displayTelemetry).toEqual(mockState.displayTelemetry);
    expect(result.current.devices[0].currentReading).not.toHaveProperty('temperature');
    expect(result.current.devices[0].currentReading).not.toHaveProperty('acOutputWatts');
    expect(result.current.latest).not.toHaveProperty('displayTelemetry');
    expect(result.current.latest).not.toHaveProperty('temperature');
    expect(result.current.latest?.recordedAt).toBe(mockState.recordedAt);
    expect(result.current.devices[0].readingFreshness).toBe('recent');
  });
  it.each([
    { inputWatts: 100, acInputWatts: 100, dcInputWatts: 0, solarInputWatts: 0 },
    { inputWatts: 200, acInputWatts: 0, dcInputWatts: 200, solarInputWatts: 200 },
  ])('preserves measured AC/solar provenance in the latest device bridge (%j)', source => {
    mockState.source = { ...source, inputMeasurement: 'delta2-pd-mqtt-v1', inputQuality: 'consistent' };
    const { result } = renderHook(() => useConvexDevices());
    expect(result.current.devices[0].currentReading).toMatchObject(mockState.source);
  });
  it("shows stale telemetry instead of reporting an old charging row online", () => {
    mockState.recordedAt = Date.now() - 10 * 60_000;
    const { result } = renderHook(() => useConvexDevices());
    expect(result.current.devices[0]).toMatchObject({ online: false, status: "Stale data", readingFreshness: "stale" });
  });

  it("uses the configured cadence when deciding whether a fetched reading is stale", () => {
    mockState.interval = 15; mockState.recordedAt = Date.now() - 10 * 60_000;
    const { result } = renderHook(() => useConvexDevices());
    expect(result.current.devices[0]).toMatchObject({ online: true, readingFreshness: "recent" });
  });

  it("keeps the last reading visible but does not claim a failed fetch is online", () => {
    mockState.status = "error";
    const { result } = renderHook(() => useConvexDevices());
    expect(result.current.devices[0]).toMatchObject({ online: false, status: "Refresh failed", currentReading: { batteryLevel: 80 } });
  });

  it("expires the freshness label without fetching or waiting for a new reading", async () => {
    const { result } = renderHook(() => useConvexDevices());
    expect(result.current.devices[0].online).toBe(true);
    await act(async () => { vi.advanceTimersByTime(3 * 60_000 + 1); });
    expect(result.current.devices[0]).toMatchObject({ online: false, readingFreshness: "stale" });
  });

  it("expires a deadline that passes between rendering and passive effects", async () => {
    function DelayPassiveEffects({ children }: { children: ReactNode }) {
      useLayoutEffect(() => {
        vi.advanceTimersByTime(3 * 60_000 + 1);
      }, []);
      return children;
    }
    const { result } = renderHook(() => useConvexDevices(), { wrapper: DelayPassiveEffects });
    expect(result.current.devices[0].readingFreshness).toBe("recent");

    await act(async () => { vi.advanceTimersByTime(1); });
    expect(result.current.devices[0]).toMatchObject({ online: false, readingFreshness: "stale" });
  });
});

it('should suppress thermal progress without changing power health when paused', () => {
  temperatureFeature.enabled = false
  mockState.temperatureRefreshing = true
  const { result } = renderHook(() => useConvexDevices())
  expect(result.current.devices[0].temperatureRefreshing).toBe(false)
  expect(result.current.devices[0].online).toBe(true)
})
