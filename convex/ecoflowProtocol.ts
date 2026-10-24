"use node";

import crypto from "crypto";

export function generateSignature(
  secretKey: string,
  accessKey: string,
  params: Record<string, string | number>,
  timestamp: number,
  nonce: string
): string {
  // Per EcoFlow docs: sort request params alphabetically first,
  // then append accessKey, nonce, timestamp at the end (fixed order).
  const sortedRequestParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const authSuffix = `accessKey=${accessKey}&nonce=${nonce}&timestamp=${timestamp}`;
  const signatureString = sortedRequestParams
    ? `${sortedRequestParams}&${authSuffix}`
    : authSuffix;

  return crypto
    .createHmac("sha256", secretKey)
    .update(signatureString)
    .digest("hex");
}

// A later source/power delta invalidates an earlier selected power packet if it
// omits either total. Pure metadata updates do not make measured totals vanish.
const PD_POWER_OR_SOURCE_FIELDS = new Set(["wattsInSum", "wattsOutSum", "inputWatts", "outputWatts",
  "inWatts", "outWatts", "carWatts", "usb1Watts", "usb2Watts", "qcUsb1Watts", "qcUsb2Watts",
  "typec1Watts", "typec2Watts", "chargerType", "acChargeFlag", "redunChargeFlag", "chgDsgState"]);

export function hasPdPowerOrSourceFields(values: Record<string, number>) {
  return Object.keys(values).some(key => PD_POWER_OR_SOURCE_FIELDS.has(key));
}
