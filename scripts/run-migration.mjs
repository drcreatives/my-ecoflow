/**
 * Run the Supabase → Convex migration programmatically.
 *
 * Usage:
 *   node scripts/run-migration.mjs <convex-user-id>
 *
 * This reads the exported data from scripts/supabase-export.json,
 * splits readings into batches to avoid payload limits,
 * and calls the migration mutations directly via the Convex client.
 */

import { ConvexHttpClient } from "convex/browser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────

const CONVEX_URL = "https://acrobatic-swordfish-996.convex.cloud";
const EXPORT_FILE = path.join(__dirname, "supabase-export.json");
const READING_BATCH_SIZE = 50; // Keep batches small to stay under Convex argument limits

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: node scripts/run-migration.mjs <convex-user-id>");
    console.error("  Find your user ID in Convex Dashboard → Data → users table");
    process.exit(1);
  }

  console.log(`\n🔄 Starting migration for user: ${userId}`);
  console.log(`📄 Reading export from: ${EXPORT_FILE}\n`);

  // Read the export file
  const raw = fs.readFileSync(EXPORT_FILE, "utf-8");
  const exported = JSON.parse(raw);
  // The export script wraps data under a "data" key
  const data = exported.data || exported;

  console.log(`📊 Export data summary:`);
  console.log(`   Devices:         ${data.devices?.length ?? 0}`);
  console.log(`   Readings:        ${data.readings?.length ?? 0}`);
  console.log(`   Settings:        ${data.settings?.length ?? 0}`);
  console.log(`   Daily Summaries: ${data.dailySummaries?.length ?? 0}`);
  console.log(`   Alerts:          ${data.alerts?.length ?? 0}`);
  console.log();

  const client = new ConvexHttpClient(CONVEX_URL);

  // Step 1: Import devices (small payload — call runMigration with only devices)
  console.log(`📦 Step 1: Importing ${data.devices.length} devices...`);
  const devicesResult = await client.action("migrations:runMigration", {
    userId,
    data: {
      devices: data.devices,
      // No readings — just import devices to get the ID mapping
    },
  });
  console.log(`   ✅ Devices result:`, devicesResult.devices);
  console.log(`   ✅ Default settings:`, devicesResult.defaultSettings);

  // We need the device ID map for readings import.
  // Since runMigration doesn't return the map, we'll call importDevices again
  // (it's idempotent) to get it. But actually, for the readings we need to use
  // runMigration which handles batching internally. The issue is payload size.
  //
  // Better approach: strip rawData from readings to reduce size, then batch.

  if (data.readings && data.readings.length > 0) {
    console.log(`\n📦 Step 2: Importing ${data.readings.length} readings in batches of ${READING_BATCH_SIZE}...`);

    // Strip rawData to reduce payload size dramatically
    const strippedReadings = data.readings.map((r) => {
      const { raw_data, ...rest } = r;
      return rest;
    });

    const totalBatches = Math.ceil(strippedReadings.length / READING_BATCH_SIZE);

    for (let i = 0; i < strippedReadings.length; i += READING_BATCH_SIZE) {
      const batch = strippedReadings.slice(i, i + READING_BATCH_SIZE);
      const batchNum = Math.floor(i / READING_BATCH_SIZE) + 1;

      process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${batch.length} readings)...`);

      try {
        const result = await client.action("migrations:runMigration", {
          userId,
          data: {
            devices: data.devices, // Always include for ID mapping (idempotent)
            readings: batch,
          },
        });
        console.log(` ✅ imported: ${result.readings?.imported ?? 0}, skipped: ${result.readings?.skipped ?? 0}`);
      } catch (err) {
        console.log(` ❌ Error: ${err.message}`);
        // Try with even smaller batch
        console.log(`   Retrying with smaller batches...`);
        const smallBatchSize = Math.max(10, Math.floor(READING_BATCH_SIZE / 5));
        for (let j = 0; j < batch.length; j += smallBatchSize) {
          const smallBatch = batch.slice(j, j + smallBatchSize);
          try {
            await client.action("migrations:runMigration", {
              userId,
              data: {
                devices: data.devices,
                readings: smallBatch,
              },
            });
            process.stdout.write(".");
          } catch (innerErr) {
            console.log(` ❌ Small batch failed: ${innerErr.message}`);
          }
        }
        console.log(" done");
      }
    }
  }

  // Step 3: Import settings, summaries, alerts (small payloads)
  if ((data.settings?.length > 0) || (data.dailySummaries?.length > 0) || (data.alerts?.length > 0)) {
    console.log(`\n📦 Step 3: Importing settings/summaries/alerts...`);
    const extraResult = await client.action("migrations:runMigration", {
      userId,
      data: {
        devices: data.devices,
        settings: data.settings || [],
        dailySummaries: data.dailySummaries || [],
        alerts: data.alerts || [],
      },
    });
    console.log(`   ✅`, extraResult);
  }

  console.log(`\n🎉 Migration complete!\n`);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
