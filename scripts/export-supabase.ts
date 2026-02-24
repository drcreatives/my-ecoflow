/**
 * Supabase Data Export Script
 *
 * Exports data from Supabase PostgreSQL tables into a JSON file
 * that can be used with the Convex migration action.
 *
 * Prerequisites:
 *   - DATABASE_URL env var set (or .env.local loaded)
 *   - `pg` package installed (already in project)
 *
 * Usage:
 *   npx tsx scripts/export-supabase.ts
 *
 * Output:
 *   scripts/supabase-export.json — ready to paste into the Convex migration action
 */

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set. Check your .env.local file.");
  process.exit(1);
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log("🔌 Connecting to Supabase PostgreSQL...");

  try {
    // Test connection
    await pool.query("SELECT 1");
    console.log("✅ Connected!\n");

    // ─── Export devices ───────────────────────────────────────────────────
    console.log("📦 Exporting devices...");
    const devicesResult = await pool.query(`
      SELECT id, device_sn, device_name, device_type, is_active,
             created_at::text, updated_at::text
      FROM devices
      ORDER BY created_at ASC
    `);
    console.log(`   Found ${devicesResult.rows.length} devices`);

    // ─── Export device readings ──────────────────────────────────────────
    console.log("📦 Exporting device_readings...");
    const readingsResult = await pool.query(`
      SELECT id, device_id,
             battery_level::float8,
             input_watts::float8,
             ac_input_watts::float8,
             dc_input_watts::float8,
             charging_type::float8,
             output_watts::float8,
             ac_output_watts::float8,
             dc_output_watts::float8,
             usb_output_watts::float8,
             remaining_time::float8,
             temperature::float8,
             status,
             raw_data,
             recorded_at::text
      FROM device_readings
      ORDER BY recorded_at ASC
    `);
    console.log(`   Found ${readingsResult.rows.length} readings`);

    // ─── Export device settings ──────────────────────────────────────────
    console.log("📦 Exporting device_settings...");
    const settingsResult = await pool.query(`
      SELECT id, device_id, setting_key, setting_value, updated_at::text
      FROM device_settings
      ORDER BY device_id, setting_key
    `);
    console.log(`   Found ${settingsResult.rows.length} settings`);

    // ─── Export daily summaries ──────────────────────────────────────────
    console.log("📦 Exporting daily_summaries...");
    let dailySummaries: any[] = [];
    try {
      const summariesResult = await pool.query(`
        SELECT id, device_id,
               date::text,
               avg_battery_level::float8,
               total_energy_in::float8,
               total_energy_out::float8,
               max_temperature::float8,
               min_temperature::float8,
               total_runtime::float8
        FROM daily_summaries
        ORDER BY date ASC
      `);
      dailySummaries = summariesResult.rows;
      console.log(`   Found ${dailySummaries.length} daily summaries`);
    } catch (e: any) {
      console.log(`   ⚠️  daily_summaries table not found, skipping`);
    }

    // ─── Export alerts ───────────────────────────────────────────────────
    console.log("📦 Exporting alerts...");
    let alerts: any[] = [];
    try {
      const alertsResult = await pool.query(`
        SELECT id, device_id, type, title, message, severity,
               is_read, created_at::text
        FROM alerts
        ORDER BY created_at ASC
      `);
      alerts = alertsResult.rows;
      console.log(`   Found ${alerts.length} alerts`);
    } catch (e: any) {
      console.log(`   ⚠️  alerts table not found, skipping`);
    }

    // ─── Assemble export ─────────────────────────────────────────────────
    const exportData = {
      exportedAt: new Date().toISOString(),
      counts: {
        devices: devicesResult.rows.length,
        readings: readingsResult.rows.length,
        settings: settingsResult.rows.length,
        dailySummaries: dailySummaries.length,
        alerts: alerts.length,
      },
      data: {
        devices: devicesResult.rows,
        readings: readingsResult.rows,
        settings: settingsResult.rows,
        dailySummaries: dailySummaries,
        alerts: alerts,
      },
    };

    const outputPath = path.resolve(__dirname, "supabase-export.json");
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

    console.log(`\n✅ Export complete!`);
    console.log(`📄 Output: ${outputPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Devices:         ${exportData.counts.devices}`);
    console.log(`   Readings:        ${exportData.counts.readings}`);
    console.log(`   Settings:        ${exportData.counts.settings}`);
    console.log(`   Daily Summaries: ${exportData.counts.dailySummaries}`);
    console.log(`   Alerts:          ${exportData.counts.alerts}`);
    console.log(
      `\nNext steps:`
    );
    console.log(`   1. Sign up in the app (creates your Convex Auth user)`);
    console.log(`   2. Find your Convex user ID in the Convex Dashboard → Data → users`);
    console.log(`   3. Run the migration from the Convex Dashboard → Actions:`);
    console.log(`      migrations:runMigration({ userId: "<your_id>", data: <paste data from export> })`);
  } catch (error) {
    console.error("❌ Export failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
