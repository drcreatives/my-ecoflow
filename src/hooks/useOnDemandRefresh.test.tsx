import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnDemandRefresh } from "./useOnDemandRefresh";
import { READING_WINDOW_REFRESH_EVENT } from "@/lib/reading-refresh-events";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
  refreshReadings: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("convex/react", () => ({ useAction: () => mocks.refreshReadings }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, info: mocks.info, error: mocks.error },
}));

function refreshResult(overrides = {}) {
  return {
    success: true,
    devicesRefreshed: 1,
    devicesSkipped: 0,
    devicesFresh: 0,
    devicesRateLimited: 0,
    devicesOffline: 0,
    devicesFailed: 0,
    retryAfterMs: 0,
    ...overrides,
  };
}

async function settle() {
  await act(async () => {});
}

describe("on-demand refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
    vi.clearAllMocks();
    mocks.pathname = "/dashboard";
    mocks.refreshReadings.mockReset().mockResolvedValue(refreshResult());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("fetches on authenticated layout mount and scopes device settings requests", async () => {
    mocks.pathname = "/device/device-a/settings";
    renderHook(() => useOnDemandRefresh());
    await settle();

    expect(mocks.refreshReadings).toHaveBeenCalledExactlyOnceWith({ deviceId: "device-a" });
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("honors the automatic cooldown but sends force for a manual fetch", async () => {
    const { result } = renderHook(() => useOnDemandRefresh());
    await settle();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(mocks.refreshReadings).toHaveBeenCalledTimes(1);

    await act(async () => result.current.refresh());
    expect(mocks.refreshReadings).toHaveBeenLastCalledWith({ force: true });
    expect(mocks.success).toHaveBeenCalledWith(expect.stringMatching(/fetched/i), expect.any(Object));
  });

  it("reports a concurrent collector as in progress without claiming a device failure or inactive device", async () => {
    const { result } = renderHook(() => useOnDemandRefresh());
    await settle();
    mocks.refreshReadings.mockResolvedValueOnce(refreshResult({ devicesRefreshed: 0, devicesSkipped: 1, devicesBusy: 1 }));
    await act(async () => result.current.refresh());
    expect(mocks.info).toHaveBeenCalledWith("No new readings fetched", {
      description: "1 already collecting; readings will update when ready",
    });
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("advances history windows on focus even during the automatic cooldown", async () => {
    renderHook(() => useOnDemandRefresh());
    await settle();
    const onRefreshWindow = vi.fn();
    window.addEventListener(READING_WINDOW_REFRESH_EVENT, onRefreshWindow);

    await act(async () => window.dispatchEvent(new Event("focus")));
    window.removeEventListener(READING_WINDOW_REFRESH_EVENT, onRefreshWindow);

    expect(onRefreshWindow).toHaveBeenCalledTimes(1);
    expect(mocks.refreshReadings).toHaveBeenCalledTimes(1);
  });

  it("fetches after the cooldown when the tab becomes visible and ignores hidden tabs", async () => {
    renderHook(() => useOnDemandRefresh());
    await settle();
    vi.setSystemTime(Date.now() + 120_000);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(mocks.refreshReadings).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(mocks.refreshReadings).toHaveBeenCalledTimes(2);
  });

  it("allows immediate automatic retry after a rejected fetch", async () => {
    mocks.refreshReadings.mockRejectedValueOnce(new Error("upstream unavailable"));
    renderHook(() => useOnDemandRefresh());
    await settle();

    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(mocks.refreshReadings).toHaveBeenCalledTimes(2);
  });

  it("does not consume the client cooldown when a device fetch fails", async () => {
    mocks.refreshReadings.mockResolvedValueOnce(refreshResult({
      success: false,
      devicesRefreshed: 0,
      devicesFailed: 1,
    }));
    renderHook(() => useOnDemandRefresh());
    await settle();

    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(mocks.refreshReadings).toHaveBeenCalledTimes(2);
  });

  it("deduplicates focus, visibility and manual requests while a scope is pending", async () => {
    let finish!: (value: ReturnType<typeof refreshResult>) => void;
    mocks.refreshReadings.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useOnDemandRefresh());

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await result.current.refresh();
    });
    expect(mocks.refreshReadings).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(true);

    await act(async () => finish(refreshResult()));
    expect(result.current.isRefreshing).toBe(false);
  });

  it("fetches the new device on navigation even while the old device is pending", async () => {
    const finishes: Array<(value: ReturnType<typeof refreshResult>) => void> = [];
    mocks.refreshReadings.mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
    mocks.pathname = "/device/device-a";
    const { result, rerender } = renderHook(() => useOnDemandRefresh());

    mocks.pathname = "/device/device-b";
    rerender();
    expect(mocks.refreshReadings.mock.calls).toEqual([
      [{ deviceId: "device-a" }],
      [{ deviceId: "device-b" }],
    ]);

    await act(async () => finishes[0](refreshResult()));
    expect(result.current.isRefreshing).toBe(true);
    await act(async () => finishes[1](refreshResult()));
    expect(result.current.isRefreshing).toBe(false);
  });

  it("does not let one device's successful refresh suppress an all-device refresh", async () => {
    mocks.pathname = "/device/device-a";
    const { rerender } = renderHook(() => useOnDemandRefresh());
    await settle();

    mocks.pathname = "/dashboard";
    rerender();
    await settle();
    expect(mocks.refreshReadings.mock.calls).toEqual([
      [{ deviceId: "device-a" }],
      [{}],
    ]);
  });

  it("stops the current route's spinner when its fetch finishes before a previous route", async () => {
    const finishes: Array<(value: ReturnType<typeof refreshResult>) => void> = [];
    mocks.refreshReadings.mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
    mocks.pathname = "/device/device-a";
    const { result, rerender } = renderHook(() => useOnDemandRefresh());
    mocks.pathname = "/device/device-b";
    rerender();

    await act(async () => finishes[1](refreshResult()));
    expect(result.current.isRefreshing).toBe(false);
    await act(async () => finishes[0](refreshResult()));
    expect(result.current.isRefreshing).toBe(false);
  });

  it("explains a server rate limit without reporting a successful fetch", async () => {
    const { result } = renderHook(() => useOnDemandRefresh());
    await settle();
    mocks.refreshReadings.mockResolvedValueOnce(refreshResult({
      devicesRefreshed: 0,
      devicesSkipped: 1,
      devicesRateLimited: 1,
      retryAfterMs: 80_000,
    }));

    await act(async () => result.current.refresh());
    expect(mocks.info).toHaveBeenCalledWith(expect.stringMatching(/no new readings/i), {
      description: expect.stringMatching(/rate.limit.*80.*second/i),
    });
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("reports partial failures and offline devices in manual feedback", async () => {
    const { result } = renderHook(() => useOnDemandRefresh());
    await settle();
    mocks.refreshReadings.mockResolvedValueOnce(refreshResult({
      success: false,
      devicesSkipped: 1,
      devicesOffline: 1,
      devicesFailed: 1,
    }));

    await act(async () => result.current.refresh());
    expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/incomplete/i), {
      description: expect.stringMatching(/1 fetched.*1 offline.*1 failed/i),
    });
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("explains already recent and inactive devices without claiming a fetch", async () => {
    const { result } = renderHook(() => useOnDemandRefresh());
    await settle();
    mocks.refreshReadings.mockResolvedValueOnce(refreshResult({
      devicesRefreshed: 0,
      devicesSkipped: 2,
      devicesFresh: 1,
    }));

    await act(async () => result.current.refresh());
    expect(mocks.info).toHaveBeenCalledWith("No new readings fetched", {
      description: "1 already recent; 1 inactive skipped",
    });
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("reports a manual request rejection and permits a later retry", async () => {
    const { result } = renderHook(() => useOnDemandRefresh());
    await settle();
    mocks.refreshReadings.mockRejectedValueOnce(new Error("Network error"));

    await act(async () => result.current.refresh());
    expect(mocks.error).toHaveBeenCalledWith("Unable to fetch readings. Please try again.");
    expect(result.current.isRefreshing).toBe(false);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(mocks.refreshReadings).toHaveBeenCalledTimes(3);
  });
});
