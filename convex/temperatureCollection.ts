/** Temperature collection is paused unless explicitly re-enabled server-side. */
export function isTemperatureCollectionEnabled(): boolean {
  return process.env.TEMPERATURE_COLLECTION_ENABLED === "true";
}
