import { describe, expect, it } from "vitest";
import { calculateEnergyTotals, type EnergyReading } from "./analytics";

const HOUR = 3_600_000;
const MINUTE = 60_000;

function reading(hour: number, watts = 100): EnergyReading {
  return {
    recordedAt: hour * HOUR,
    outputWatts: watts,
    acInputWatts: watts * 2,
    dcInputWatts: watts / 2,
    inputWatts: watts * 2.5,
    chargingType: 2,
    inputQuality: 'consistent',
    inputMeasurement: 'delta2-pd-mqtt-v1',
    solarInputWatts: watts / 2,
  };
}

describe("calculateEnergyTotals", () => {
  it('should not allocate independent panel power to station source energy or clamp it to the station total', () => {
    const point: EnergyReading = {
      recordedAt: 0, inputWatts: 221, outputWatts: 172,
      acInputWatts: null, dcInputWatts: null, solarInputWatts: null,
      inputQuality: 'incomplete', powerMeasurement: 'pd-totals-mqtt-v1',
      solarPanelInputWatts: 226, solarPanelReceivedAt: 1_000, solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
    }
    const points = [point, { ...point, recordedAt: HOUR, solarPanelReceivedAt: HOUR + 1_000 }]
    expect(calculateEnergyTotals(points, 'raw')).toMatchObject({
      totalInput: 0.221, consumed: 0.172, unattributedInput: 0.221,
      acInput: 0, dcInput: 0, solarInput: 0, sourceIntervals: 0, solarIntervals: 0,
    })
    const completeAc = points.map(row => ({ ...row, inputQuality: 'consistent' as const,
      inputMeasurement: 'delta2-pd-mqtt-v1' as const, acInputWatts: 221, dcInputWatts: 0, solarInputWatts: 0 }))
    expect(calculateEnergyTotals(completeAc, 'raw')).toMatchObject({ totalInput: 0.221, acInput: 0.221, solarInput: 0 })
    expect(points.map(row => row.solarPanelInputWatts)).toEqual([226, 226])
  })

  it("integrates uniformly sampled long-range raw readings", () => {
    const readings = [0, 1.5, 3, 4.5, 6].map((hour) => reading(hour));

    expect(calculateEnergyTotals(readings, "raw", 1.5 * HOUR)).toEqual({
      consumed: 0.6,
      acInput: 1.2,
      solarInput: 0.3,
      dcInput: 0.3,
      totalInput: 1.5,
      unattributedInput: 0,
      sourceIntervals: 4,
      solarIntervals: 4,
      sourceCoveredMs: 6 * HOUR,
      solarCoveredMs: 6 * HOUR,
      solarPanelInput: 0,
      solarPanelIntervals: 0,
      solarPanelCoveredMs: 0,
    });
  });

  it("integrates uniformly sampled long-range five-minute readings", () => {
    const readings = [0, 1.5, 3, 4.5, 6].map((hour) => reading(hour));

    expect(calculateEnergyTotals(readings, "5m", 1.5 * HOUR).consumed).toBe(0.6);
  });

  it("does not bridge a genuine offline gap", () => {
    const readings = [
      reading(0),
      reading(1.5),
      reading(3),
      reading(4.5),
      reading(24),
    ];

    expect(calculateEnergyTotals(readings, "raw", 1.5 * HOUR).consumed).toBe(0.45);
  });

  it("does not infer sampling from regularly sparse readings", () => {
    const readings = [0, 6, 12, 18].map((hour) => reading(hour));

    expect(calculateEnergyTotals(readings, "raw").consumed).toBe(0);
  });

  it("does not invent energy for null endpoints", () => {
    const readings = [reading(0), reading(1), reading(2), reading(3)];
    readings[1].outputWatts = null;
    readings[2].outputWatts = null;

    expect(calculateEnergyTotals(readings, "raw").consumed).toBe(0);
  });

  it('does not count adapter or unidentified DC energy as solar', () => {
    const readings = [reading(0), reading(1)];
    readings[0].chargingType = 1;
    readings[1].chargingType = 1;
    readings[0].solarInputWatts = 0;
    readings[1].solarInputWatts = 0;
    expect(calculateEnergyTotals(readings, 'raw')).toMatchObject({ dcInput: 0.05, solarInput: 0 });
    readings[0].chargingType = null;
    readings[1].chargingType = 2;
    readings[0].solarInputWatts = null;
    expect(calculateEnergyTotals(readings, 'raw').solarInput).toBe(0);
  });

  it('keeps conflicting source power out of AC and solar history totals', () => {
    const readings = [reading(0), reading(1)];
    readings[1].inputQuality = 'inconsistent';
    expect(calculateEnergyTotals(readings, 'raw')).toMatchObject({
      totalInput: 0.25, unattributedInput: 0.25, acInput: 0, dcInput: 0, solarInput: 0,
    });
  });

  it('does not turn missing legacy source evidence into measured zero energy', () => {
    const readings = [reading(0), reading(1)];
    readings[0].inputQuality = undefined;
    readings[1].inputQuality = undefined;
    expect(calculateEnergyTotals(readings, 'raw').unattributedInput).toBe(0.25);
    expect(calculateEnergyTotals(readings, 'raw').acInput).toBe(0);
    expect(calculateEnergyTotals(readings, 'raw').sourceIntervals).toBe(0);
  });

  it.each([undefined, null, 'legacy-modules', 'delta2-pd-v1'] as const)(
    'keeps coherent historical snapshots unclassified without live source proof (%s)', inputMeasurement => {
      const readings = [reading(0), reading(1)].map(row => ({ ...row, inputMeasurement }));
      const before = JSON.stringify(readings);
      expect(calculateEnergyTotals(readings, 'raw')).toMatchObject({
        totalInput: 0.25, consumed: 0.1, unattributedInput: 0.25,
        acInput: 0, dcInput: 0, solarInput: 0, sourceIntervals: 0, solarIntervals: 0,
      });
      expect(JSON.stringify(readings)).toBe(before);
    },
  );

  it.each([undefined, 'legacy-modules', 'delta2-pd-v1'] as const)(
    'does not bridge source allocation across an unverified historical endpoint (%s)', inputMeasurement => {
      const readings = [reading(0), { ...reading(1), inputMeasurement }, reading(2), reading(3)];
      const totals = calculateEnergyTotals(readings, 'raw');
      expect(totals).toMatchObject({
        totalInput: 0.75, consumed: 0.3, unattributedInput: 0.5,
        acInput: 0.2, dcInput: 0.05, solarInput: 0.05,
        sourceIntervals: 1, solarIntervals: 1, sourceCoveredMs: HOUR, solarCoveredMs: HOUR,
      });
    },
  );

  it('rejects invalid power without poisoning totals', () => {
    const readings = [reading(0), reading(1)];
    readings[0].outputWatts = Number.NaN;
    readings[0].acInputWatts = Number.POSITIVE_INFINITY;
    expect(calculateEnergyTotals(readings, 'raw')).toMatchObject({
      consumed: 0, acInput: 0, dcInput: 0, solarInput: 0,
    });
  });

  it('integrates confirmed solar across an AC-to-solar transition and mixed hourly buckets', () => {
    const readings = [
      { ...reading(0), inputWatts: 100, acInputWatts: 100, dcInputWatts: 0, solarInputWatts: 0, chargingType: 0 },
      { ...reading(1), inputWatts: 100, acInputWatts: 0, dcInputWatts: 100, solarInputWatts: 100 },
    ];
    expect(calculateEnergyTotals(readings, 'raw')).toMatchObject({ acInput: 0.05, dcInput: 0.05, solarInput: 0.05, unattributedInput: 0 });
    const mixed = [0, 1].map(hour => ({ ...reading(hour), inputWatts: 100, acInputWatts: 50, dcInputWatts: 50,
      solarInputWatts: 50, chargingType: null }));
    expect(calculateEnergyTotals(mixed, '1h').solarInput).toBe(0.05);
  });

  it('keeps unknown DC and historical evidence unclassified without retroactive allocation', () => {
    const readings = [0, 1].map(hour => ({ ...reading(hour), solarInputWatts: null }));
    expect(calculateEnergyTotals(readings, 'raw')).toMatchObject({ solarInput: 0, dcInput: 0.05, solarIntervals: 0 });
    const legacy = readings.map(row => ({ ...row, inputMeasurement: null, inputQuality: undefined }));
    expect(calculateEnergyTotals(legacy, 'raw')).toMatchObject({ solarInput: 0, acInput: 0, dcInput: 0, unattributedInput: 0.25 });
  });

  it.each([0, 255])('reports unavailable solar coverage for unknown PD DC type %s', chargingType => {
    const readings = [0, 1].map(hour => ({ ...reading(hour), inputWatts: 100, acInputWatts: 0,
      dcInputWatts: 100, chargingType, solarInputWatts: null }));
    expect(calculateEnergyTotals(readings, 'raw')).toMatchObject({ solarInput: 0, solarIntervals: 0, sourceIntervals: 1, dcInput: 0.1 });
  });

  it('should report source and confirmed-solar coverage only for their accepted station intervals', () => {
    const unknownSolar = { inputMeasurement: 'delta2-pd-mqtt-v1' as const, solarInputWatts: null };
    const readings = [
      reading(0), reading(1), { ...reading(2), inputQuality: 'incomplete' as const },
      { ...reading(3), ...unknownSolar }, { ...reading(4), ...unknownSolar },
    ];
    expect(calculateEnergyTotals(readings, 'raw')).toMatchObject({
      sourceIntervals: 2, sourceCoveredMs: 2 * HOUR,
      solarIntervals: 1, solarCoveredMs: HOUR,
    });
  });

  it.each([NaN, Infinity, -Infinity])('should reject nonfinite timestamps without poisoning any totals (%s)', timestamp => {
    const totals = calculateEnergyTotals([reading(0), { ...reading(1), recordedAt: timestamp }, reading(2)], 'raw');
    expect(Object.values(totals).every(value => value === 0)).toBe(true);
  });

  it('should reject overflowing durations between finite timestamps', () => {
    const totals = calculateEnergyTotals([
      { ...reading(0), recordedAt: -Number.MAX_VALUE },
      { ...reading(1), recordedAt: Number.MAX_VALUE },
    ], 'raw');
    expect(Object.values(totals).every(value => value === 0)).toBe(true);
  });
});

function panelReading(minute: number, watts = 226, receiptOffsetMs = 1_000): EnergyReading {
  const recordedAt = 10 * HOUR + minute * MINUTE;
  return {
    recordedAt, inputWatts: 221, outputWatts: 172,
    acInputWatts: null, dcInputWatts: null, solarInputWatts: null,
    inputQuality: 'incomplete', powerMeasurement: 'pd-totals-mqtt-v1',
    solarPanelInputWatts: watts, solarPanelReceivedAt: recordedAt + receiptOffsetMs,
    solarPanelMeasurement: 'delta2-mppt-mqtt-v1',
  };
}

describe('independent solar panel energy', () => {
  it('should estimate panel energy separately when station AC/DC channels are unavailable', () => {
    const rows = [panelReading(0), panelReading(1)];
    const totals = calculateEnergyTotals(rows, 'raw');
    expect(totals.solarPanelInput).toBeCloseTo(0.226 / 60);
    expect(totals.totalInput).toBeCloseTo(0.221 / 60);
    expect(totals.unattributedInput).toBeCloseTo(totals.totalInput);
    expect(totals).toMatchObject({
      solarPanelIntervals: 1, solarPanelCoveredMs: MINUTE,
      sourceIntervals: 0, sourceCoveredMs: 0, solarIntervals: 0, solarCoveredMs: 0,
      acInput: 0, dcInput: 0, solarInput: 0,
    });
    expect(rows.map(row => row.solarPanelInputWatts)).toEqual([226, 226]);
  });

  it('should use the independent receipt duration rather than the station timestamp duration', () => {
    const totals = calculateEnergyTotals([panelReading(0, 226, 0), panelReading(1, 326, 5_000)], 'raw');
    expect(totals.solarPanelInput).toBeCloseTo(276 * 65_000 / HOUR / 1000);
    expect(totals.solarPanelCoveredMs).toBe(65_000);
    expect(totals.totalInput).toBeCloseTo(221 * MINUTE / HOUR / 1000);
  });

  it('should clip panel receipts to the selected window and interpolate the clipped endpoint watts', () => {
    const startTime = 10 * HOUR;
    const rows = [panelReading(0, 100, -5_000), panelReading(1, 300, 5_000)];
    const totals = calculateEnergyTotals(rows, 'raw', null, { startTime, endTime: startTime + MINUTE });
    expect(totals.solarPanelInput).toBeCloseTo(200 * MINUTE / HOUR / 1000);
    expect(totals).toMatchObject({ solarPanelIntervals: 1, solarPanelCoveredMs: MINUTE });
    expect(totals.totalInput).toBeCloseTo(221 * MINUTE / HOUR / 1000);

    const partial = calculateEnergyTotals(rows, 'raw', null, { startTime: startTime + 5_000, endTime: startTime + 40_000 });
    const clippedAverageWatts = (100 + 200 * 10 / 70 + 100 + 200 * 45 / 70) / 2;
    expect(partial.solarPanelInput).toBeCloseTo(clippedAverageWatts * 35_000 / HOUR / 1000);
    expect(partial.solarPanelCoveredMs).toBe(35_000);
    expect(calculateEnergyTotals(rows, 'raw', null, { startTime: startTime + 70_000 }).solarPanelIntervals).toBe(0);
  });

  it('should preserve measured zero panel energy with real coverage', () => {
    expect(calculateEnergyTotals([panelReading(0, 0), panelReading(1, 0)], 'raw')).toMatchObject({
      solarPanelInput: 0, solarPanelIntervals: 1, solarPanelCoveredMs: MINUTE,
    });
  });

  const invalidEvidence: Array<[string, Partial<EnergyReading>]> = [
    ['missing PD total marker', { powerMeasurement: null }],
    ['missing panel marker', { solarPanelMeasurement: null }],
    ['missing panel watts', { solarPanelInputWatts: null }],
    ['negative panel watts', { solarPanelInputWatts: -1 }],
    ['NaN panel watts', { solarPanelInputWatts: NaN }],
    ['infinite panel watts', { solarPanelInputWatts: Infinity }],
    ['missing receipt', { solarPanelReceivedAt: null }],
    ['NaN receipt', { solarPanelReceivedAt: NaN }],
    ['infinite receipt', { solarPanelReceivedAt: Infinity }],
    ['negative receipt', { solarPanelReceivedAt: -1 }],
    ['out-of-range receipt', { solarPanelReceivedAt: 1e100 }],
    ['receipt more than five seconds later', { solarPanelReceivedAt: 10 * HOUR + MINUTE + 5_001 }],
    ['receipt more than five seconds earlier', { solarPanelReceivedAt: 10 * HOUR + MINUTE - 5_001 }],
  ];

  it.each(invalidEvidence)('should leave panel energy unavailable for %s', (_label, invalid) => {
    expect(calculateEnergyTotals([panelReading(0), { ...panelReading(1), ...invalid }], 'raw')).toMatchObject({
      solarPanelInput: 0, solarPanelIntervals: 0, solarPanelCoveredMs: 0,
    });
  });

  it('should not bridge an invalid or missing middle panel report', () => {
    const rows = [panelReading(0), { ...panelReading(1), solarPanelMeasurement: null }, panelReading(2), panelReading(3)];
    const totals = calculateEnergyTotals(rows, 'raw');
    expect(totals.solarPanelInput).toBeCloseTo(0.226 / 60);
    expect(totals).toMatchObject({ solarPanelIntervals: 1, solarPanelCoveredMs: MINUTE });
  });

  it.each([
    ['duplicate panel receipt', panelReading(1 / 60, 226, 0)],
    ['backward panel receipt', panelReading(1 / 60, 226, -500)],
    ['duplicate station time', panelReading(0, 226, 2_000)],
    ['backward station time', panelReading(-1 / 60, 226, 2_000)],
  ] as const)('should not integrate a %s', (_label, current) => {
    expect(calculateEnergyTotals([panelReading(0), current], 'raw')).toMatchObject({
      solarPanelInput: 0, solarPanelIntervals: 0, solarPanelCoveredMs: 0,
    });
  });

  it('should bound panel gaps independently of display aggregation', () => {
    expect(calculateEnergyTotals([panelReading(0), panelReading(2)], '1d')).toMatchObject({
      solarPanelIntervals: 1, solarPanelCoveredMs: 2 * MINUTE,
    });
    expect(calculateEnergyTotals([panelReading(0), panelReading(2 + 1 / MINUTE)], '1d').solarPanelIntervals).toBe(0);
  });

  it('should allow the configured collection cadence but reject a genuine gap beyond it', () => {
    const options = { collectionIntervalMinutes: 5 };
    expect(calculateEnergyTotals([panelReading(0), panelReading(10)], 'raw', null, options)).toMatchObject({
      solarPanelIntervals: 1, solarPanelCoveredMs: 10 * MINUTE,
    });
    expect(calculateEnergyTotals([panelReading(0), panelReading(10 + 1 / MINUTE)], 'raw', null, options).solarPanelIntervals).toBe(0);
  });

  it('should widen gaps only for explicit sampling and keep an offline interval unmeasured', () => {
    const rows = [panelReading(0), panelReading(3), panelReading(6), panelReading(20)];
    expect(calculateEnergyTotals(rows, 'raw').solarPanelIntervals).toBe(0);
    expect(calculateEnergyTotals(rows, 'raw', 3 * MINUTE)).toMatchObject({
      solarPanelIntervals: 2, solarPanelCoveredMs: 6 * MINUTE,
    });
    expect(calculateEnergyTotals([panelReading(0), panelReading(6 + 1 / MINUTE)], 'raw', 3 * MINUTE).solarPanelIntervals).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity, -1])('should not widen panel gaps for an invalid cadence or sampling interval (%s)', invalid => {
    expect(calculateEnergyTotals([panelReading(0), panelReading(3)], 'raw', invalid, { collectionIntervalMinutes: invalid }).solarPanelIntervals).toBe(0);
  });

  it.each([{ rows: [] }, { rows: [panelReading(0)] }])('should not extrapolate panel energy without an interval', ({ rows }) => {
    expect(calculateEnergyTotals(rows, 'raw')).toMatchObject({
      solarPanelInput: 0, solarPanelIntervals: 0, solarPanelCoveredMs: 0,
      sourceCoveredMs: 0, solarCoveredMs: 0,
    });
  });
});
