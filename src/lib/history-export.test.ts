import { describe, expect, it } from "vitest";
import { createHistoryCsv, createSettingsExportReadings, createSettingsReadingsCsv } from "./history-export";

describe("history export", () => {
  it('should retain the observation count of a temperature bucket without claiming a sensor receipt', () => {
    const [headers, row] = createHistoryCsv([{
      recordedAt: 1_000, temperature: 41.5, temperatureSampleCount: 4,
      temperatureMeasurement: null,
    }]).split('\n').map(line => line.split(','))
    expect(Object.fromEntries(headers.map((header, index) => [header, row[index]]))).toMatchObject({
      'Temp °C': '41.5', 'Temperature Sample Count': '4', 'Temperature Measurement': '',
    })
    const legacy = createHistoryCsv([{ recordedAt: 0 }]).split('\n').map(line => line.split(','))
    expect(legacy[1][legacy[0].indexOf('Temperature Sample Count')]).toBe('')
  })

  it('should preserve independent thermal events without synthesizing station readings in any export', () => {
    const reading = { recordedAt: 1_000, readingKind: 'temperature' as const, temperatureMeasurement: 'bms-generic-mqtt-v1' as const, temperature: 0 }
    const [headers, row] = createHistoryCsv([reading]).split('\n').map(line => line.split(','))
    expect(Object.fromEntries(headers.map((header, index) => [header, row[index]]))).toMatchObject({ 'Reading Kind': 'temperature', 'Temperature Measurement': 'bms-generic-mqtt-v1', 'Temp °C': '0', 'Battery %': '', 'Input W': '', 'Output W': '', 'AC Input W': '', 'DC Input W': '' })
    expect(createSettingsExportReadings([reading])[0]).toMatchObject({ ...reading, recordedAt: new Date(1_000).toISOString() })
    const [settingsHeaders, settingsRow] = createSettingsReadingsCsv([reading]).split('\n').map(line => line.split(','))
    expect(Object.fromEntries(settingsHeaders.map((header, index) => [header, settingsRow[index]]))).toMatchObject({ readingKind: '"temperature"', temperatureMeasurement: '"bms-generic-mqtt-v1"', temperature: '"0"', inputWatts: '""', outputWatts: '""', acInputWatts: '""', dcInputWatts: '""' })
    expect(JSON.parse(JSON.stringify(createSettingsExportReadings([{ recordedAt: 0 }])))[0]).not.toHaveProperty('readingKind')
  })

  it('should keep live station totals and independent panel evidence separate in every legacy export format', () => {
    const reading = {
      recordedAt: 1_000, inputWatts: 221, acInputWatts: null, dcInputWatts: null, solarInputWatts: null,
      inputQuality: 'incomplete' as const, inputMeasurement: null, powerMeasurement: 'pd-totals-mqtt-v1' as const,
      solarPanelInputWatts: 226, solarPanelReceivedAt: 1_003, solarPanelMeasurement: 'delta2-mppt-mqtt-v1' as const,
    }
    const [headers, row] = createHistoryCsv([reading]).split('\n').map(line => line.split(','))
    expect(Object.fromEntries(headers.map((header, index) => [header, row[index]]))).toMatchObject({
      'Input W': '221', 'AC Input W': '', 'DC Input W': '', 'Solar Input W': '', 'Input Measurement': '',
      'Power Measurement': 'pd-totals-mqtt-v1', 'Solar Panel Input W': '226',
      'Solar Panel Received At (ms)': '1003', 'Solar Panel Measurement': 'delta2-mppt-mqtt-v1',
    })
    expect(createSettingsExportReadings([reading])[0]).toMatchObject({ ...reading, recordedAt: new Date(reading.recordedAt).toISOString() })
    const [settingsHeaders, settingsRow] = createSettingsReadingsCsv([reading]).split('\n').map(line => line.split(','))
    expect(Object.fromEntries(settingsHeaders.map((header, index) => [header, settingsRow[index]]))).toMatchObject({
      inputWatts: '"221"', solarInputWatts: '""', acInputWatts: '""', inputMeasurement: '""',
      powerMeasurement: '"pd-totals-mqtt-v1"', solarPanelInputWatts: '"226"',
      solarPanelReceivedAt: '"1003"', solarPanelMeasurement: '"delta2-mppt-mqtt-v1"',
    })
  })

  it('should preserve a real panel zero and leave old rows without new evidence', () => {
    const zero = { recordedAt: 0, powerMeasurement: 'pd-totals-mqtt-v1' as const, solarPanelInputWatts: 0, solarPanelReceivedAt: 0, solarPanelMeasurement: 'delta2-mppt-mqtt-v1' as const }
    expect(createSettingsExportReadings([zero])[0]).toMatchObject({ solarPanelInputWatts: 0, solarPanelReceivedAt: 0 })
    const [headers, row] = createHistoryCsv([{ recordedAt: 0 }]).split('\n').map(line => line.split(','))
    for (const field of ['Power Measurement', 'Solar Panel Input W', 'Solar Panel Received At (ms)', 'Solar Panel Measurement']) {
      expect(row[headers.indexOf(field)]).toBe('')
    }
    expect(JSON.parse(JSON.stringify(createSettingsExportReadings([{ recordedAt: 0 }])))[0]).not.toHaveProperty('solarPanelInputWatts')
  })

  it("preserves source channels, zero totals and consistency metadata", () => {
    const csv = createHistoryCsv([{
      recordedAt: 0,
      inputWatts: 0,
      acInputWatts: 20,
      dcInputWatts: 300,
      chargingType: 2,
      inputQuality: "inconsistent",
    }]);
    const [headers, row] = csv.split("\n").map(line => line.split(","));
    expect(Object.fromEntries(headers.map((header, index) => [header, row[index]]))).toMatchObject({
      "Input W": "0",
      "AC Input W": "20",
      "DC Input W": "300",
      "Charging Type": "2",
      "Input Quality": "inconsistent",
    });
  });

  it("leaves unknown legacy source evidence empty instead of claiming no usage", () => {
    const [, row] = createHistoryCsv([{ recordedAt: 0 }]).split("\n");
    expect(row.split(",").slice(2, 10)).toEqual(["", "", "", "", "", "", "", ""]);
  });

  it('preserves forward AC/solar measurement evidence through History CSV and Settings JSON/CSV', () => {
    const readings = [
      { recordedAt: 0, inputWatts: 100, acInputWatts: 100, dcInputWatts: 0, solarInputWatts: 0, inputQuality: 'consistent' as const, inputMeasurement: 'delta2-pd-v1' as const },
      { recordedAt: 1000, inputWatts: 200, acInputWatts: 0, dcInputWatts: 200, solarInputWatts: 200, chargingType: 2, inputQuality: 'consistent' as const, inputMeasurement: 'delta2-pd-mqtt-v1' as const },
    ];
    const history = createHistoryCsv(readings).split('\n').map(line => line.split(','));
    const methodIndex = history[0].indexOf('Input Measurement');
    const solarIndex = history[0].indexOf('Solar Input W');
    expect(history.slice(1).map(row => [row[methodIndex], row[solarIndex]])).toEqual([['delta2-pd-v1', '0'], ['delta2-pd-mqtt-v1', '200']]);
    expect(JSON.parse(JSON.stringify(createSettingsExportReadings(readings))).map((row: { inputMeasurement: string; solarInputWatts: number }) => [row.inputMeasurement, row.solarInputWatts]))
      .toEqual([['delta2-pd-v1', 0], ['delta2-pd-mqtt-v1', 200]]);
    const settings = createSettingsReadingsCsv(readings).split('\n');
    expect(settings[0]).toContain('inputMeasurement,solarInputWatts');
    expect(settings[1]).toContain('"delta2-pd-v1","0"');
    expect(settings[2]).toContain('"delta2-pd-mqtt-v1","200"');
    const legacy = JSON.parse(JSON.stringify(createSettingsExportReadings([{ recordedAt: 0 }])))[0];
    expect(legacy).not.toHaveProperty('inputMeasurement');
    expect(legacy).not.toHaveProperty('solarInputWatts');
  });

  it('should preserve live versus configured DC classification across CSV and JSON exports', () => {
    const readings = [
      { recordedAt: 0, chargingType: 2, chargingTypeSource: 'device-setting' as const },
      { recordedAt: 1_000, chargingType: 1, chargingTypeSource: 'live-pd' as const },
    ]
    const history = createHistoryCsv(readings).split('\n').map(row => row.split(','))
    const sourceIndex = history[0].indexOf('Charging Type Source')
    expect(history.slice(1).map(row => row[sourceIndex])).toEqual(['device-setting', 'live-pd'])
    expect(createSettingsExportReadings(readings).map(row => row.chargingTypeSource)).toEqual(['device-setting', 'live-pd'])
    const settings = createSettingsReadingsCsv(readings).split('\n')
    expect(settings[0]).toContain('chargingType,chargingTypeSource')
    expect(settings[1]).toContain('"2","device-setting"')
    expect(settings[2]).toContain('"1","live-pd"')
    expect(JSON.parse(JSON.stringify(createSettingsExportReadings([{ recordedAt: 0 }])))[0]).not.toHaveProperty('chargingTypeSource')
  })

  it('should exclude display cache from reading exports without filling missing measurements', () => {
    const reading = {
      recordedAt: 0, temperature: null, acOutputWatts: null,
      displayTelemetry: { temperature: { value: 24, receivedAt: 1_000, source: 'rest-cache' } },
    }
    const json = createSettingsExportReadings([reading])[0]
    expect(json.temperature).toBeNull()
    expect(json.acOutputWatts).toBeNull()
    expect(json).not.toHaveProperty('displayTelemetry')
    const history = createHistoryCsv([reading]).split('\n').map(line => line.split(','))
    expect(history[1][history[0].indexOf('Temp °C')]).toBe('')
    expect(history[1][history[0].indexOf('AC Out')]).toBe('')
    expect(createSettingsReadingsCsv([reading])).not.toContain('rest-cache')
  })
});
