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
});
