import { getConfirmedSolarInputWatts, getTrustedInputChannels, getVerifiedSolarPanelInput, type InputSourceReading } from './reading-status';

export type HistoryAggregation = "raw" | "5m" | "1h" | "1d";

export interface EnergyReading extends InputSourceReading {
  recordedAt: number;
  outputWatts: number | null;
  acInputWatts: number | null;
  dcInputWatts: number | null;
}

export interface EnergyTotals {
  consumed: number;
  acInput: number;
  solarInput: number;
  dcInput: number;
  totalInput: number;
  unattributedInput: number;
  sourceIntervals: number;
  solarIntervals: number;
  sourceCoveredMs: number;
  solarCoveredMs: number;
  solarPanelInput: number;
  solarPanelIntervals: number;
  solarPanelCoveredMs: number;
}

const MS_PER_HOUR = 3_600_000;

const BASE_MAX_GAP_HOURS: Record<HistoryAggregation, number> = {
  raw: 1,
  "5m": 0.5,
  "1h": 3,
  "1d": 36,
};

/**
 * Integrate power readings into energy totals while avoiding interpolation across
 * genuine offline periods. Convex explicitly reports when a long history query was
 * uniformly sampled, allowing those wider intervals without guessing from sparse data.
 */
export function calculateEnergyTotals(
  readings: EnergyReading[],
  aggregation: HistoryAggregation,
  samplingIntervalMs: number | null = null,
  options: { collectionIntervalMinutes?: number; startTime?: number; endTime?: number } = {}
): EnergyTotals {
  if (readings.length < 2) {
    return {
      consumed: 0, acInput: 0, solarInput: 0, dcInput: 0, totalInput: 0,
      unattributedInput: 0, sourceIntervals: 0, solarIntervals: 0,
      sourceCoveredMs: 0, solarCoveredMs: 0, solarPanelInput: 0,
      solarPanelIntervals: 0, solarPanelCoveredMs: 0,
    };
  }

  const samplingIntervalHours =
    samplingIntervalMs !== null && Number.isFinite(samplingIntervalMs) && samplingIntervalMs > 0
      ? samplingIntervalMs / MS_PER_HOUR
      : null;
  const maxGapHours = Math.max(
    BASE_MAX_GAP_HOURS[aggregation],
    samplingIntervalHours === null ? 0 : samplingIntervalHours * 2
  );
  const configuredCollectionMs = (options.collectionIntervalMinutes ?? 0) * 60_000;
  const maxSolarPanelGapMs = Math.max(
    2 * 60_000,
    Number.isFinite(configuredCollectionMs) && configuredCollectionMs > 0 ? configuredCollectionMs * 2 : 0,
    samplingIntervalHours === null ? 0 : samplingIntervalHours * MS_PER_HOUR * 2
  );

  let consumedWh = 0;
  let acInputWh = 0;
  let solarInputWh = 0;
  let dcInputWh = 0;
  let totalInputWh = 0;
  let unattributedInputWh = 0;
  let sourceIntervals = 0;
  let solarIntervals = 0;
  let sourceCoveredMs = 0;
  let solarCoveredMs = 0;
  let solarPanelInputWh = 0;
  let solarPanelIntervals = 0;
  let solarPanelCoveredMs = 0;

  for (let index = 1; index < readings.length; index += 1) {
    const previous = readings[index - 1];
    const current = readings[index];
    const intervalMs = current.recordedAt - previous.recordedAt;
    if (!Number.isFinite(previous.recordedAt) || !Number.isFinite(current.recordedAt) ||
      !Number.isFinite(intervalMs) || intervalMs <= 0) continue;
    const intervalHours = intervalMs / MS_PER_HOUR;

    // Panel energy belongs to its own measurement point and receipt clock. Keep
    // invalid/missing adjacent rows as breaks instead of filtering across them.
    const previousPanel = getVerifiedSolarPanelInput(previous);
    const currentPanel = getVerifiedSolarPanelInput(current);
    if (previousPanel && currentPanel &&
      Math.abs(previousPanel.receivedAt - previous.recordedAt) <= 5_000 &&
      Math.abs(currentPanel.receivedAt - current.recordedAt) <= 5_000) {
      const panelIntervalMs = currentPanel.receivedAt - previousPanel.receivedAt;
      if (Number.isFinite(panelIntervalMs) && panelIntervalMs > 0 && panelIntervalMs <= maxSolarPanelGapMs) {
        const coveredStart = Math.max(previousPanel.receivedAt, options.startTime ?? previousPanel.receivedAt);
        const coveredEnd = Math.min(currentPanel.receivedAt, options.endTime ?? currentPanel.receivedAt);
        if (Number.isFinite(coveredStart) && Number.isFinite(coveredEnd) && coveredEnd > coveredStart) {
          const wattsChange = currentPanel.watts - previousPanel.watts;
          const startWatts = previousPanel.watts + wattsChange * (coveredStart - previousPanel.receivedAt) / panelIntervalMs;
          const endWatts = previousPanel.watts + wattsChange * (coveredEnd - previousPanel.receivedAt) / panelIntervalMs;
          const coveredMs = coveredEnd - coveredStart;
          solarPanelInputWh += (startWatts / 2 + endWatts / 2) * coveredMs / MS_PER_HOUR;
          solarPanelIntervals += 1;
          solarPanelCoveredMs += coveredMs;
        }
      }
    }

    if (intervalHours > maxGapHours) continue;

    if (isPower(previous.outputWatts) && isPower(current.outputWatts)) {
      consumedWh +=
        ((previous.outputWatts + current.outputWatts) / 2) * intervalHours;
    }
    const previousChannels = getTrustedInputChannels(previous);
    const currentChannels = getTrustedInputChannels(current);
    const hasTrustedSources = previousChannels !== null && currentChannels !== null;

    if (isPower(previous.inputWatts) && isPower(current.inputWatts)) {
      const inputWh = ((previous.inputWatts + current.inputWatts) / 2) * intervalHours;
      totalInputWh += inputWh;
      if (!hasTrustedSources) unattributedInputWh += inputWh;
    }
    if (hasTrustedSources) {
      sourceIntervals += 1;
      sourceCoveredMs += intervalMs;
      acInputWh +=
        ((previousChannels.acInputWatts + currentChannels.acInputWatts) / 2) * intervalHours;
      const dcWh = ((previousChannels.dcInputWatts + currentChannels.dcInputWatts) / 2) * intervalHours;
      dcInputWh += dcWh;
      const previousSolar = getConfirmedSolarInputWatts(previous);
      const currentSolar = getConfirmedSolarInputWatts(current);
      if (previousSolar !== null && currentSolar !== null) {
        solarIntervals += 1;
        solarCoveredMs += intervalMs;
        solarInputWh += ((previousSolar + currentSolar) / 2) * intervalHours;
      }
    }
  }

  return {
    consumed: consumedWh / 1000,
    acInput: acInputWh / 1000,
    solarInput: solarInputWh / 1000,
    dcInput: dcInputWh / 1000,
    totalInput: totalInputWh / 1000,
    unattributedInput: unattributedInputWh / 1000,
    sourceIntervals,
    solarIntervals,
    sourceCoveredMs,
    solarCoveredMs,
    solarPanelInput: solarPanelInputWh / 1000,
    solarPanelIntervals,
    solarPanelCoveredMs,
  };
}

function isPower(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
