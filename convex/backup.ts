"use node";

import { internalAction, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Resend } from "resend";
import { Id } from "./_generated/dataModel";

// ─── Backup Email Template ───────────────────────────────────────────────────

function backupEmailHtml(data: {
  userName: string;
  deviceCount: number;
  readingCount: number;
  dateRange: string;
  dashboardUrl: string;
  generatedAt: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;margin:0;padding:20px;background-color:#f4f4f4;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#44af21,#00c356);color:#fff;padding:30px;text-align:center;">
    <h1 style="margin:0;font-size:24px;">📦 EcoFlow Data Backup</h1>
  </div>
  <div style="padding:30px;">
    <p>Hi ${data.userName},</p>
    <p>Your scheduled data backup is attached as a JSON file. Here's a summary:</p>
    <div style="background:#f8f9fa;padding:15px;border-radius:6px;margin:20px 0;">
      <h3 style="margin:0 0 10px;font-size:16px;color:#495057;">Backup Summary</h3>
      <p style="margin:5px 0;"><strong>Devices:</strong> ${data.deviceCount}</p>
      <p style="margin:5px 0;"><strong>Readings:</strong> ${data.readingCount}</p>
      <p style="margin:5px 0;"><strong>Date Range:</strong> ${data.dateRange}</p>
      <p style="margin:5px 0;"><strong>Generated:</strong> ${data.generatedAt}</p>
    </div>
    <p>You can also manually export your data from your <a href="${data.dashboardUrl}/settings" style="color:#44af21;">Settings page</a>.</p>
  </div>
  <div style="background:#f8f9fa;padding:20px;text-align:center;font-size:14px;color:#6c757d;">
    <p>To change backup frequency or disable automatic backups, visit your <a href="${data.dashboardUrl}/settings" style="color:#44af21;">Settings</a>.</p>
  </div>
</div>
</body></html>`;
}

// ─── Check & Run Backups (called by cron) ─────────────────────────────────────

/**
 * Cron-triggered action: checks all users' backup settings and sends
 * backup emails to those whose interval has elapsed.
 */
export const checkAndRunBackups = internalAction({
  args: {},
  handler: async (ctx) => {
    const allSettings = await ctx.runQuery(
      internal.settings.getAllDataRetentionSettings
    );

    const now = Date.now();

    for (const settings of allSettings) {
      // Skip users who have backup disabled
      if (!settings.backupEnabled) continue;

      const intervalMs =
        (settings.backupIntervalHours ?? 24) * 60 * 60 * 1000;
      const lastBackup = settings.lastBackupAt ?? 0;

      // Skip if not enough time has elapsed
      if (now - lastBackup < intervalMs) continue;

      // Run backup for this user
      try {
        await runBackupForUser(ctx, settings.userId, now);
      } catch (err) {
        console.error(
          `Backup failed for user ${settings.userId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  },
});

// ─── Single-User Backup Logic ─────────────────────────────────────────────────

interface ReadingRecord {
  recordedAt: number;
  batteryLevel?: number;
  inputWatts?: number;
  outputWatts?: number;
  acInputWatts?: number;
  dcInputWatts?: number;
  acOutputWatts?: number;
  dcOutputWatts?: number;
  usbOutputWatts?: number;
  remainingTime?: number;
  temperature?: number;
  status?: string;
  deviceName?: string;
  deviceSn?: string;
}

async function runBackupForUser(
  ctx: ActionCtx,
  userId: Id<"users">,
  now: number
) {
  // 1. Get user profile for email + name
  const user = await ctx.runQuery(internal.backup_queries.getUserById, { userId });
  if (!user?.email) {
    console.log(`Skipping backup for user ${userId}: no email`);
    return;
  }

  // 2. Get user's devices
  const devices = await ctx.runQuery(internal.devices_internal.listByUserId, {
    userId,
  });

  if (devices.length === 0) {
    console.log(`Skipping backup for user ${userId}: no devices`);
    return;
  }

  // 3. Get recent readings for each device (last 7 days)
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const allReadings: ReadingRecord[] = [];

  for (const device of devices) {
    const readings = await ctx.runQuery(
      internal.backup_queries.getDeviceReadingsInRange,
      {
        deviceId: device._id,
        startTime: sevenDaysAgo,
        endTime: now,
      }
    );
    allReadings.push(
      ...readings.map((r: ReadingRecord) => ({
        ...r,
        deviceName: device.deviceName,
        deviceSn: device.deviceSn,
      }))
    );
  }

  // 4. Build backup JSON
  const backupData = {
    exportedAt: new Date(now).toISOString(),
    user: {
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    },
    devices: devices.map((d) => ({
      deviceName: d.deviceName,
      deviceSn: d.deviceSn,
      deviceType: d.deviceType,
      isActive: d.isActive,
      registeredAt: d._creationTime
        ? new Date(d._creationTime).toISOString()
        : null,
    })),
    readings: allReadings.map((r) => ({
      deviceName: r.deviceName,
      deviceSn: r.deviceSn,
      recordedAt: new Date(r.recordedAt).toISOString(),
      batteryLevel: r.batteryLevel ?? null,
      inputWatts: r.inputWatts ?? null,
      outputWatts: r.outputWatts ?? null,
      acInputWatts: r.acInputWatts ?? null,
      dcInputWatts: r.dcInputWatts ?? null,
      acOutputWatts: r.acOutputWatts ?? null,
      dcOutputWatts: r.dcOutputWatts ?? null,
      usbOutputWatts: r.usbOutputWatts ?? null,
      remainingTime: r.remainingTime ?? null,
      temperature: r.temperature ?? null,
      status: r.status ?? null,
    })),
  };

  const jsonStr = JSON.stringify(backupData, null, 2);

  // 5. Send email with attachment
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Backup email skipped: RESEND_API_KEY not set");
    return;
  }

  const dashboardUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://my-ecoflow.vercel.app";

  const userName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "there";

  const oldestReading = allReadings.length
    ? new Date(
        Math.min(...allReadings.map((r) => r.recordedAt))
      ).toLocaleDateString()
    : "N/A";
  const newestReading = allReadings.length
    ? new Date(
        Math.max(...allReadings.map((r) => r.recordedAt))
      ).toLocaleDateString()
    : "N/A";

  const html = backupEmailHtml({
    userName,
    deviceCount: devices.length,
    readingCount: allReadings.length,
    dateRange: `${oldestReading} – ${newestReading}`,
    dashboardUrl,
    generatedAt: new Date(now).toLocaleString(),
  });

  const resend = new Resend(apiKey);
  const dateStr = new Date(now).toISOString().slice(0, 10);

  const { error } = await resend.emails.send({
    from: "EcoFlow Dashboard <backup@devrunor.com>",
    to: user.email,
    subject: `📦 EcoFlow Data Backup – ${dateStr}`,
    html,
    attachments: [
      {
        filename: `ecoflow-backup-${dateStr}.json`,
        content: Buffer.from(jsonStr).toString("base64"),
        contentType: "application/json",
      },
    ],
  });

  if (error) {
    console.error(`Backup email failed for ${user.email}:`, error.message);
    return;
  }

  // 6. Update lastBackupAt
  await ctx.runMutation(internal.settings.updateLastBackup, {
    userId,
    timestamp: now,
  });

  console.log(
    `Backup sent to ${user.email}: ${devices.length} devices, ${allReadings.length} readings`
  );
}
