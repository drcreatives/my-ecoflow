export const READING_WINDOW_REFRESH_EVENT = "ecoflow:reading-window-refresh";

export interface ReadingWindowRefreshDetail {
  deviceId?: string;
}

/** Advance open history windows after a deliberate refresh or return to the app. */
export function notifyReadingWindowRefresh(deviceId?: string) {
  window.dispatchEvent(new CustomEvent<ReadingWindowRefreshDetail>(
    READING_WINDOW_REFRESH_EVENT,
    { detail: { deviceId } }
  ));
}
