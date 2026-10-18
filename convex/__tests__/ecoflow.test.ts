import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flattenParams,
  generateSignature,
  transformQuotaToReading,
} from "../ecoflow";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EcoFlow protocol helpers", () => {
  it("generates a stable signature with alphabetically sorted parameters", () => {
    const signature = generateSignature(
      "secret",
      "access",
      { z: 9, a: 1 },
      1_700_000_000_000,
      "123456"
    );

    expect(signature).toBe(
      "d8eb1e79e37aa000cb453ae6ec66be2da447375e302d551504d99cdc4e5ebade"
    );
  });

  it("flattens nested SET payloads using dot-separated keys", () => {
    expect(
      flattenParams({
        sn: "R351",
        moduleType: 5,
        params: { enabled: 1, nested: { watts: 600 } },
      })
    ).toEqual({
      sn: "R351",
      moduleType: "5",
      "params.enabled": "1",
      "params.nested.watts": "600",
    });
  });

  it("uses the firmware sign and precise charge time when net charging", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const reading = transformQuotaToReading({
      "pd.wattsInSum": 500,
      "pd.wattsOutSum": 100,
      "pd.remainTime": 120,
      "bms_emsStatus.chgRemainTime": 115,
      "bms_emsStatus.dsgRemainTime": 300,
      "bms_bmsStatus.soc": 75,
      "mppt.chgPauseFlag": 1,
    });

    expect(reading).toMatchObject({
      status: "charging",
      inputWatts: 500,
      outputWatts: 100,
      remainingTime: 115,
      batteryLevel: 75,
      acChargingPaused: true,
      recordedAt: 1_700_000_000_000,
    });
  });

  it("stores discharge time as negative even with simultaneous input", () => {
    const reading = transformQuotaToReading({
      "pd.wattsInSum": 100,
      "pd.wattsOutSum": 400,
      "pd.remainTime": -90,
      "bms_emsStatus.chgRemainTime": 200,
      "bms_emsStatus.dsgRemainTime": 88,
    });

    expect(reading.status).toBe("discharging");
    expect(reading.remainingTime).toBe(-88);
  });

  it("uses the net-power deadband when firmware remaining time has no sign", () => {
    expect(
      transformQuotaToReading({
        "pd.wattsInSum": 105,
        "pd.wattsOutSum": 100,
        "pd.remainTime": 0,
        "bms_bmsStatus.soc": 50,
      }).status
    ).toBe("standby");
  });

  it("preserves authoritative zero totals instead of stale module watts", () => {
    expect(transformQuotaToReading({
      "pd.wattsInSum": 0,
      "pd.wattsOutSum": 0,
      "pd.outputWatts": 600,
      "inv.inputWatts": 500,
      "mppt.inWatts": 0,
      "inv.outputWatts": 400,
    })).toMatchObject({ inputWatts: 0, outputWatts: 0, acInputWatts: 0, dcInputWatts: 0,
      acOutputWatts: 0, dcOutputWatts: 0, usbOutputWatts: 0, inputQuality: "inconsistent" });
  });

  it.each([
    { ac: 400, dc: 0, total: 400, type: 3 },
    { ac: 0, dc: 378, total: 378, type: 2 },
    { ac: 100, dc: 378, total: 478, type: 2 },
  ])("retains a coherent measured input mix ($ac W AC + $dc W DC)", ({ ac, dc, total, type }) => {
    expect(transformQuotaToReading({
      "pd.wattsInSum": total, "inv.inputWatts": ac, "mppt.inWatts": dc, "mppt.chgType": type,
    })).toMatchObject({ inputWatts: total, acInputWatts: ac, dcInputWatts: dc, chargingType: type, inputQuality: "consistent" });
  });

  it("marks contradictory source watts without guessing or rescaling the allocation", () => {
    expect(transformQuotaToReading({
      "pd.wattsInSum": 129, "inv.inputWatts": 103, "mppt.inWatts": 378,
    })).toMatchObject({ inputWatts: 129, acInputWatts: 103, dcInputWatts: 378, inputQuality: "inconsistent" });
  });

  it("keeps absent channels unknown and only derives a total from both channels", () => {
    expect(transformQuotaToReading({ "inv.inputWatts": 300 })).toMatchObject({
      inputWatts: undefined, acInputWatts: 300, dcInputWatts: undefined, inputQuality: "incomplete",
    });
    expect(transformQuotaToReading({ "inv.inputWatts": 300, "mppt.inWatts": 50 })).toMatchObject({
      inputWatts: 350, acInputWatts: 300, dcInputWatts: 50, inputQuality: "incomplete",
    });
  });

  it.each(["", "  ", "Infinity", "NaN", "500 watts", Infinity, NaN, -50])(
    "rejects invalid power values (%s) instead of inventing source energy", (value) => {
      expect(transformQuotaToReading({ "inv.inputWatts": value })).toMatchObject({
        inputWatts: undefined, acInputWatts: undefined, inputQuality: "incomplete",
      });
    }
  );

  it("parses complete finite numeric strings, preserving zero", () => {
    expect(transformQuotaToReading({
      "pd.wattsInSum": "0", "inv.inputWatts": "0", "mppt.inWatts": "0", "pd.wattsOutSum": "0",
    })).toMatchObject({ inputWatts: 0, outputWatts: 0, inputQuality: "consistent" });
  });

  it("rejects a derived total that overflows finite numeric bounds", () => {
    expect(transformQuotaToReading({ "inv.inputWatts": 1e308, "mppt.inWatts": 1e308 })).toMatchObject({
      inputWatts: undefined, inputQuality: "incomplete",
    });
  });
});

describe("DELTA 2 model 80 PD input measurement", () => {
  const pdQuota = {
    "pd.model": 80,
    "pd.sysVer": 16908850,
    "pd.wattsInSum": 104,
    "pd.inputWatts": 104,
    "pd.chargerType": 0,
    "inv.inputWatts": 134,
    "inv.outputWatts": 134,
    "mppt.inWatts": 378,
    "mppt.chgType": 2,
  };

  it("restores same-packet AC/DC/USB output despite missing unchanged USB port fields", () => {
    expect(transformQuotaToReading({ ...pdQuota,
      "pd.wattsOutSum": 159, "pd.outputWatts": 92, "pd.carWatts": 62,
      "pd.typec1Watts": 5, "pd.usb1Watts": 0, "inv.outputWatts": 101,
    })).toMatchObject({ outputWatts: 159, acOutputWatts: 92, dcOutputWatts: 62, usbOutputWatts: 5 });
  });

  it("preserves genuine zero USB output and does not replace PD AC output with asynchronous INV output", () => {
    expect(transformQuotaToReading({ ...pdQuota,
      "pd.wattsOutSum": 72, "pd.outputWatts": 41, "pd.carWatts": 31, "inv.outputWatts": 99,
    })).toMatchObject({ outputWatts: 72, acOutputWatts: 41, dcOutputWatts: 31, usbOutputWatts: 0 });
  });

  it.each<Record<string, number>>([
    { "pd.wattsOutSum": 70, "pd.outputWatts": 41, "pd.carWatts": 31 },
    { "pd.wattsOutSum": 159, "pd.outputWatts": 92 },
    { "pd.wattsOutSum": 159, "pd.carWatts": 62 },
    { "pd.outputWatts": 92, "pd.carWatts": 62 },
  ])("does not invent USB output from an incomplete or contradictory PD packet (%j)", (fields) => {
    expect(transformQuotaToReading({ ...pdQuota, ...fields }).usbOutputWatts).toBeUndefined();
  });

  it("uses same-module PD AC power instead of an asynchronous inverter measurement", () => {
    expect(transformQuotaToReading(pdQuota)).toMatchObject({
      inputWatts: 104, acInputWatts: 104, dcInputWatts: 0, solarInputWatts: 0,
      chargingType: 3, inputQuality: "consistent", inputMeasurement: "delta2-pd-v1",
    });
  });

  it("records solar input from PD while ignoring stale inverter charging power", () => {
    expect(transformQuotaToReading({
      ...pdQuota, "pd.wattsInSum": 486, "pd.inputWatts": 0, "pd.chargerType": 2,
      "inv.inputWatts": 378, "mppt.inWatts": 485, "mppt.chgType": 3,
    })).toMatchObject({
      inputWatts: 486, acInputWatts: 0, dcInputWatts: 486, solarInputWatts: 486,
      chargingType: 2, inputQuality: "consistent", inputMeasurement: "delta2-pd-v1",
    });
  });

  it("keeps adapter DC distinct from solar even if the MPPT flag is stale", () => {
    expect(transformQuotaToReading({
      ...pdQuota, "pd.wattsInSum": 100, "pd.inputWatts": 0, "pd.chargerType": 1,
    })).toMatchObject({
      inputWatts: 100, acInputWatts: 0, dcInputWatts: 100, solarInputWatts: 0,
      chargingType: 1, inputQuality: "consistent", inputMeasurement: "delta2-pd-v1",
    });
  });

  it.each([
    { setting: "solar" as const, chargingType: 2, solar: 100 },
    { setting: "adapter" as const, chargingType: 1, solar: 0 },
  ])("records configured $setting wiring when live DC subtype is absent", ({ setting, chargingType, solar }) => {
    expect(transformQuotaToReading({ ...pdQuota, "pd.wattsInSum": 100, "pd.inputWatts": 0 }, {
      dcInputSource: setting,
    })).toMatchObject({
      inputWatts: 100, acInputWatts: 0, dcInputWatts: 100, solarInputWatts: solar,
      chargingType, chargingTypeSource: "device-setting", inputQuality: "consistent",
    });
  });

  it.each([
    { setting: "solar" as const, liveType: 1 },
    { setting: "adapter" as const, liveType: 2 },
  ])("flags live type $liveType contradicting configured $setting without claiming solar", ({ setting, liveType }) => {
    expect(transformQuotaToReading({ ...pdQuota, "pd.wattsInSum": 100, "pd.inputWatts": 0, "pd.chargerType": liveType }, {
      dcInputSource: setting,
    })).toMatchObject({
      acInputWatts: 0, dcInputWatts: 100, solarInputWatts: undefined,
      chargingType: undefined, chargingTypeSource: undefined, inputQuality: "inconsistent",
    });
  });

  it("preserves live source provenance when the configured wiring agrees", () => {
    expect(transformQuotaToReading({ ...pdQuota, "pd.wattsInSum": 100, "pd.inputWatts": 0, "pd.chargerType": 2 }, {
      dcInputSource: "solar",
    })).toMatchObject({ solarInputWatts: 100, chargingTypeSource: "live-pd", inputQuality: "consistent" });
  });

  it("does not label AC or zero input as solar because solar panels are configured", () => {
    for (const watts of [0, 104]) {
      expect(transformQuotaToReading({ ...pdQuota, "pd.wattsInSum": watts, "pd.inputWatts": watts }, {
        dcInputSource: "solar",
      })).toMatchObject({
        acInputWatts: watts, dcInputWatts: 0, solarInputWatts: 0,
        chargingType: watts === 0 ? 0 : 3, chargingTypeSource: undefined, inputQuality: "consistent",
      });
    }
  });

  it("records both AC-to-solar and solar-to-AC transitions from the PD frame", () => {
    const solar = { ...pdQuota, "pd.wattsInSum": 486, "pd.inputWatts": 0, "pd.chargerType": 2 };
    const ac = { ...solar, "pd.wattsInSum": 99, "pd.inputWatts": 99, "pd.chargerType": 255 };
    expect([pdQuota, solar, ac].map((fields) => transformQuotaToReading(fields))).toEqual([
      expect.objectContaining({ acInputWatts: 104, dcInputWatts: 0, chargingType: 3, inputQuality: "consistent" }),
      expect.objectContaining({ acInputWatts: 0, dcInputWatts: 486, chargingType: 2, inputQuality: "consistent" }),
      expect.objectContaining({ acInputWatts: 99, dcInputWatts: 0, chargingType: 3, inputQuality: "consistent" }),
    ]);
  });

  it("preserves the observed two-watt PD rounding difference without rescaling", () => {
    expect(transformQuotaToReading({ ...pdQuota, "pd.wattsInSum": 39, "pd.inputWatts": 41 })).toMatchObject({
      inputWatts: 39, acInputWatts: 41, dcInputWatts: 0, inputQuality: "consistent",
    });
  });

  it("keeps an unvalidated mixed-input split incomplete", () => {
    expect(transformQuotaToReading({ ...pdQuota, "pd.wattsInSum": 100, "pd.inputWatts": 40, "pd.chargerType": 2 })).toMatchObject({
      inputWatts: 100, acInputWatts: 40, dcInputWatts: 60, chargingType: 2,
      inputQuality: "incomplete", inputMeasurement: "delta2-pd-v1", solarInputWatts: undefined,
    });
  });

  it.each([0, 255, -1, ""])("keeps unknown PD DC type %s as DC without claiming solar", (type) => {
    expect(transformQuotaToReading({ ...pdQuota, "pd.wattsInSum": 100, "pd.inputWatts": 0, "pd.chargerType": type })).toMatchObject({
      inputWatts: 100, acInputWatts: 0, dcInputWatts: 100,
      chargingType: undefined, inputQuality: "consistent", inputMeasurement: "delta2-pd-v1", solarInputWatts: undefined,
    });
  });

  it.each([
    { total: 100, ac: 150 },
    { total: 0, ac: 41 },
  ])("retains contradictory PD AC $ac W against total $total W without fallback", ({ total, ac }) => {
    expect(transformQuotaToReading({ ...pdQuota, "pd.wattsInSum": total, "pd.inputWatts": ac, "inv.inputWatts": total, "mppt.inWatts": 0 })).toMatchObject({
      inputWatts: total, acInputWatts: ac, dcInputWatts: 0,
      inputQuality: "inconsistent", inputMeasurement: "delta2-pd-v1", solarInputWatts: undefined,
    });
  });

  it("uses coherent PD zero input despite stale nonzero INV/MPPT readings", () => {
    expect(transformQuotaToReading({ ...pdQuota, "pd.wattsInSum": 0, "pd.inputWatts": 0 })).toMatchObject({
      inputWatts: 0, acInputWatts: 0, dcInputWatts: 0, chargingType: 0,
      inputQuality: "consistent", inputMeasurement: "delta2-pd-v1", solarInputWatts: 0,
    });
  });

  it.each([79, undefined])("retains the legacy module path for other or unknown models (%s)", (model) => {
    const pdFields: Record<string, number | string> = model === undefined ? {} : { "pd.model": model, "pd.inputWatts": 0 };
    expect(transformQuotaToReading({
      ...pdFields, "pd.wattsInSum": 400, "inv.inputWatts": 400, "mppt.inWatts": 0, "mppt.chgType": 3,
    })).toMatchObject({
      inputWatts: 400, acInputWatts: 400, dcInputWatts: 0, chargingType: 3,
      inputQuality: "consistent", inputMeasurement: "legacy-modules", solarInputWatts: undefined,
    });
  });

  it.each([undefined, "", "NaN", -1])("does not use INV as AC when known DELTA 2 PD input is missing or invalid (%s)", (pdInput) => {
    const fields: Record<string, number | string> = {
      "pd.model": 80, "pd.sysVer": 16908850, "pd.wattsInSum": 400, "inv.inputWatts": 400, "mppt.inWatts": 0, "mppt.chgType": 3,
    };
    if (pdInput !== undefined) fields["pd.inputWatts"] = pdInput;
    expect(transformQuotaToReading(fields)).toMatchObject({
      inputWatts: 400, acInputWatts: undefined, dcInputWatts: undefined,
      inputQuality: "incomplete", inputMeasurement: "delta2-pd-v1", solarInputWatts: undefined,
    });
  });

  it("does not derive a missing DELTA 2 total from asynchronous INV/MPPT values", () => {
    expect(transformQuotaToReading({
      "pd.model": 80, "pd.sysVer": 16908850, "pd.inputWatts": 400, "inv.inputWatts": 400, "mppt.inWatts": 100,
    })).toMatchObject({
      inputWatts: undefined, acInputWatts: 400, dcInputWatts: undefined,
      inputQuality: "incomplete", inputMeasurement: "delta2-pd-v1", solarInputWatts: undefined,
    });
  });

  it.each([undefined, 16908851])("does not attribute sources on unverified DELTA 2 PD firmware (%s)", (firmware) => {
    const fields: Record<string, number | string> = {
      "pd.model": 80, "pd.wattsInSum": 100, "pd.inputWatts": 0, "pd.chargerType": 2,
      "inv.inputWatts": 0, "mppt.inWatts": 100, "mppt.chgType": 2,
    };
    if (firmware !== undefined) fields["pd.sysVer"] = firmware;
    expect(transformQuotaToReading(fields)).toMatchObject({
      inputWatts: 100, acInputWatts: 0, dcInputWatts: undefined, chargingType: undefined,
      inputQuality: "incomplete", inputMeasurement: undefined, solarInputWatts: undefined,
    });
  });
});
