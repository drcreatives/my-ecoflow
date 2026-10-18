import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConvexHistoryReadings, useConvexReadingHistory } from "./useConvexData";
import { notifyReadingWindowRefresh } from "@/lib/reading-refresh-events";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  latest: [] as Array<{ deviceId: string; reading: { recordedAt: number } }>,
  latestTemperatureAt: null as number | null | undefined,
  collectionSettings: { collectionIntervalMinutes: 5 } as { collectionIntervalMinutes: number } | null | undefined,
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));

const initialTime = Date.parse("2026-10-18T10:00:00Z");

function historyArgs() {
  const calls = mocks.useQuery.mock.calls.filter(([reference]) =>
    getFunctionName(reference) === "readings:history"
  );
  return calls.at(-1)![1];
}

describe("reading history windows", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(initialTime);
    mocks.latest = [];
    mocks.latestTemperatureAt = null;
    mocks.collectionSettings = { collectionIntervalMinutes: 5 };
    mocks.useQuery.mockReset().mockImplementation((reference, args) => {
      if (args === "skip") return undefined;
      if (getFunctionName(reference) === "readings:latest") return mocks.latest;
      if (getFunctionName(reference) === "readings:latestTemperatureTimestamp") return mocks.latestTemperatureAt;
      if (getFunctionName(reference) === "settings:getDataRetention") return mocks.collectionSettings;
      return { readings: [], summary: null, samplingIntervalMs: 60_000 };
    });
  });

  afterEach(() => vi.useRealTimers());

  it("keeps preset arguments stable on unrelated rerenders, then advances on a refresh signal", () => {
    const { result, rerender } = renderHook(() =>
      useConvexHistoryReadings("device-a", { timeRange: "24h" })
    );
    const initialArgs = historyArgs();
    vi.setSystemTime(initialTime + 60_000);
    rerender();
    expect(historyArgs()).toEqual(initialArgs);

    act(() => notifyReadingWindowRefresh());
    expect(historyArgs()).toMatchObject({
      startTime: initialTime + 60_000 - 86_400_000,
      endTime: initialTime + 60_000,
    });
    expect(result.current.samplingIntervalMs).toBe(60_000);
  });

  it('preserves forward AC/solar measurements and legacy absence through both history bridge hooks', () => {
    const readings = [
      { recordedAt: initialTime - 1000, inputWatts: 100, acInputWatts: 100, dcInputWatts: 0, solarInputWatts: 0, inputMeasurement: 'delta2-pd-v1', inputQuality: 'consistent' },
      { recordedAt: initialTime, inputWatts: 200, acInputWatts: 0, dcInputWatts: 200, solarInputWatts: 200, inputMeasurement: 'delta2-pd-mqtt-v1', inputQuality: 'consistent', chargingType: 2 },
      { recordedAt: initialTime - 2000, inputWatts: 100, inputMeasurement: null, solarInputWatts: null, inputQuality: null },
    ];
    mocks.useQuery.mockImplementation((reference, args) => {
      if (args === 'skip') return undefined;
      if (getFunctionName(reference) === 'readings:latest') return [];
      if (getFunctionName(reference) === 'readings:latestTemperatureTimestamp') return null;
      return { readings, summary: null };
    });
    const history = renderHook(() => useConvexHistoryReadings('device-a', { timeRange: '24h' }));
    const direct = renderHook(() => useConvexReadingHistory('device-a'));
    expect(history.result.current.readings).toEqual(readings);
    expect(direct.result.current.readings).toEqual(readings);
  });

  it('should retain backend energy and sampled-reading counts without recomputing them from a displayed bucket', () => {
    const energyTotals = {
      consumed: 1.2, acInput: 0, dcInput: 0, solarInput: 0, totalInput: 1.3,
      unattributedInput: 1.3, sourceIntervals: 0, solarIntervals: 0,
      sourceCoveredMs: 0, solarCoveredMs: 0,
      solarPanelInput: 1.4, solarPanelIntervals: 12, solarPanelCoveredMs: 720_000,
    };
    const readings = [{
      recordedAt: initialTime, inputWatts: 221, solarPanelInputWatts: null,
      solarPanelMeasurement: null, solarPanelReceivedAt: null,
      solarPanelAverageWatts: 226, solarPanelSampleCount: 12, sampleCount: 20,
    }];
    mocks.useQuery.mockImplementation((reference, args) => {
      if (args === 'skip') return undefined;
      if (getFunctionName(reference) === 'readings:latest') return [];
      if (getFunctionName(reference) === 'readings:latestTemperatureTimestamp') return null;
      return { readings, summary: null, energyTotals, sampledReadings: 97, samplingIntervalMs: 180_000 };
    });
    const { result } = renderHook(() => useConvexHistoryReadings('device-a', { timeRange: '24h' }));
    expect(result.current.energyTotals).toEqual(energyTotals);
    expect(result.current.sampledReadings).toBe(97);
    expect(result.current.readings).toEqual(readings);
    expect(result.current.readings[0].solarPanelReceivedAt).toBeNull();
  });

  it('should leave energy unavailable for a skipped history query', () => {
    const { result } = renderHook(() => useConvexHistoryReadings(null));
    expect(result.current.energyTotals).toBeNull();
    expect(result.current.sampledReadings).toBe(0);
    expect(result.current.collectionIntervalMinutes).toBeNull();
    expect(result.current.temperatureReadings).toEqual([]);
    expect(result.current.temperatureSummary).toBeNull();
    expect(result.current.temperatureSampledReadings).toBe(0);
    expect(result.current.temperatureSamplingIntervalMs).toBeNull();
  });

  it('should expose only a known cadence while keeping the reading window stable as cached settings arrive', () => {
    mocks.collectionSettings = undefined;
    const { result, rerender } = renderHook(() => useConvexHistoryReadings('device-a', { timeRange: '24h' }));
    const initialArgs = historyArgs();
    expect(result.current.collectionIntervalMinutes).toBeNull();
    vi.setSystemTime(initialTime + 60_000);
    mocks.collectionSettings = { collectionIntervalMinutes: 10 };
    rerender();
    expect(result.current.collectionIntervalMinutes).toBe(10);
    expect(historyArgs()).toEqual(initialArgs);
    mocks.collectionSettings = null;
    rerender();
    expect(result.current.collectionIntervalMinutes).toBe(5);
  });

  it("ignores refresh signals for another device", () => {
    renderHook(() => useConvexHistoryReadings("device-a", { timeRange: "1h" }));
    vi.setSystemTime(initialTime + 60_000);
    act(() => notifyReadingWindowRefresh("device-b"));
    expect(historyArgs().endTime).toBe(initialTime);

    act(() => notifyReadingWindowRefresh("device-a"));
    expect(historyArgs().endTime).toBe(initialTime + 60_000);
  });

  it("includes newly collected rows while the page remains open without polling", () => {
    const { rerender } = renderHook(() =>
      useConvexHistoryReadings("device-a", { timeRange: "24h" })
    );
    vi.setSystemTime(initialTime + 300_000);
    mocks.latest = [
      { deviceId: "device-a", reading: { recordedAt: initialTime + 299_000 } },
    ];
    rerender();
    expect(historyArgs().endTime).toBe(initialTime + 299_000);

    vi.setSystemTime(initialTime + 400_000);
    rerender();
    expect(historyArgs().endTime).toBe(initialTime + 299_000);
  });

  it("advances a rolling window for a new temperature without making power fresh", () => {
    const oldPowerAt = initialTime - 60_000;
    mocks.latest = [{ deviceId: "device-a", reading: { recordedAt: oldPowerAt } }];
    const { rerender } = renderHook(() => useConvexHistoryReadings("device-a", { timeRange: "1h" }));
    vi.setSystemTime(initialTime + 120_000);
    mocks.latestTemperatureAt = initialTime + 119_000;
    rerender();
    expect(historyArgs().endTime).toBe(initialTime + 119_000);
    expect(mocks.latest[0].reading.recordedAt).toBe(oldPowerAt);
    vi.setSystemTime(initialTime + 180_000);
    rerender();
    expect(historyArgs().endTime).toBe(initialTime + 119_000);
  });

  it("retains the independent sensor stream, its zero, timestamps and sampling metadata", () => {
    const temperatureSummary = { avgTemperature: 0, maxTemperature: 0, temperatureReadings: 21 };
    const temperatureReadings = [{ deviceId: 'device-a', deviceName: 'Test station', deviceSn: 'TEST',
      temperature: 0, recordedAt: initialTime - 500, temperatureSampleCount: 1,
      temperatureMeasurement: 'bms-generic-mqtt-v1' }];
    mocks.useQuery.mockImplementation((reference, args) => {
      if (args === 'skip') return undefined;
      switch (getFunctionName(reference)) {
        case 'readings:latest': return [];
        case 'readings:latestTemperatureTimestamp': return initialTime - 500;
        case 'settings:getDataRetention': return mocks.collectionSettings;
        default: return { readings: [], summary: null, temperatureReadings, temperatureSummary,
          temperatureSamplingIntervalMs: 300_000, temperatureSampledReadings: 21 };
      }
    });
    const { result } = renderHook(() => useConvexHistoryReadings('device-a', { timeRange: '24h' }));
    expect(result.current.readings).toEqual([]);
    expect(result.current.temperatureReadings).toEqual(temperatureReadings);
    expect(result.current.summary).toBeNull();
    expect(result.current.temperatureSummary).toEqual(temperatureSummary);
    expect(result.current.temperatureSamplingIntervalMs).toBe(300_000);
    expect(result.current.temperatureSampledReadings).toBe(21);
  });

  it("reopens the rolling window when switching devices", () => {
    const { rerender } = renderHook(({ deviceId }) =>
      useConvexHistoryReadings(deviceId, { timeRange: "6h" }),
    { initialProps: { deviceId: "device-a" } });
    vi.setSystemTime(initialTime + 60_000);
    rerender({ deviceId: "device-b" });
    expect(historyArgs()).toMatchObject({
      deviceId: "device-b",
      endTime: initialTime + 60_000,
    });
  });

  it("preserves fixed custom dates during refresh and skips the live subscription", () => {
    const filters = {
      customStartDate: "2026-10-01T00:00:00Z",
      customEndDate: "2026-10-02T00:00:00Z",
    };
    renderHook(() => useConvexHistoryReadings("device-a", filters));
    const initialArgs = historyArgs();
    vi.setSystemTime(initialTime + 60_000);
    act(() => notifyReadingWindowRefresh());
    expect(historyArgs()).toEqual(initialArgs);
    expect(mocks.useQuery.mock.calls.some(([reference, args]) =>
      getFunctionName(reference) === "readings:latest" && args !== "skip"
    )).toBe(false);
    expect(mocks.useQuery.mock.calls.some(([reference, args]) =>
      getFunctionName(reference) === "readings:latestTemperatureTimestamp" && args !== "skip"
    )).toBe(false);
  });

  it("uses a selected preset even when previous custom dates remain in page state", () => {
    renderHook(() => useConvexHistoryReadings("device-a", {
      timeRange: "1h",
      customStartDate: "2026-10-01T00:00:00Z",
      customEndDate: "2026-10-02T00:00:00Z",
    }));
    expect(historyArgs()).toMatchObject({
      startTime: initialTime - 3_600_000,
      endTime: initialTime,
    });
  });

  it("advances default history windows but leaves an explicit end time fixed", () => {
    const defaultHook = renderHook(() => useConvexReadingHistory("device-a"));
    vi.setSystemTime(initialTime + 60_000);
    act(() => notifyReadingWindowRefresh());
    expect(historyArgs().endTime).toBe(initialTime + 60_000);
    defaultHook.unmount();

    renderHook(() => useConvexReadingHistory("device-a", {
      startTime: initialTime - 3_600_000,
      endTime: initialTime,
    }));
    act(() => notifyReadingWindowRefresh());
    expect(historyArgs().endTime).toBe(initialTime);
  });
});
