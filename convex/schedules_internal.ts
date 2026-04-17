"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Process all enabled schedules — called by cron every minute.
 * Computes local time per schedule timezone, fires matching ones.
 */
export const processSchedules = internalAction({
  args: {},
  handler: async (ctx) => {
    if (process.env.DISABLE_CRONS === "true") {
      return { success: true, skipped: true };
    }

    const schedules = await ctx.runQuery(internal.schedules.listAllEnabled);
    if (schedules.length === 0) return { success: true, fired: 0 };

    const now = Date.now();
    let fired = 0;
    const errors: string[] = [];

    for (const schedule of schedules) {
      try {
        // Compute current local time in the schedule's timezone using Intl.DateTimeFormat
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: schedule.timezone,
          hour: "2-digit",
          minute: "2-digit",
          weekday: "short",
          hour12: false,
        });
        const parts = formatter.formatToParts(new Date(now));
        const localHH = parts.find((p) => p.type === "hour")?.value ?? "00";
        const localMM = parts.find((p) => p.type === "minute")?.value ?? "00";
        const localTime = `${localHH}:${localMM}`;
        const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
        const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const localDay = dayMap[weekdayStr] ?? new Date(now).getDay();

        // Check time match
        if (localTime !== schedule.time) continue;

        // Check day-of-week match (empty = every day)
        if (schedule.daysOfWeek.length > 0 && !schedule.daysOfWeek.includes(localDay)) continue;

        // Prevent double-execution within the same minute
        if (schedule.lastExecutedAt) {
          const lastFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: schedule.timezone,
            hour: "2-digit",
            minute: "2-digit",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour12: false,
          });
          const lastParts = lastFormatter.formatToParts(new Date(schedule.lastExecutedAt));
          const lastHH = lastParts.find((p) => p.type === "hour")?.value ?? "";
          const lastMM = lastParts.find((p) => p.type === "minute")?.value ?? "";
          const lastDate = `${lastParts.find((p) => p.type === "year")?.value}-${lastParts.find((p) => p.type === "month")?.value}-${lastParts.find((p) => p.type === "day")?.value}`;

          const nowFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: schedule.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour12: false,
          });
          const nowParts = nowFormatter.formatToParts(new Date(now));
          const nowDate = `${nowParts.find((p) => p.type === "year")?.value}-${nowParts.find((p) => p.type === "month")?.value}-${nowParts.find((p) => p.type === "day")?.value}`;

          if (
            `${lastHH}:${lastMM}` === localTime &&
            lastDate === nowDate
          ) {
            continue;
          }
        }

        // Look up device SN for the API call
        const device = await ctx.runQuery(internal.devices_internal.getById, {
          deviceId: schedule.deviceId,
        });
        if (!device || !device.isActive) continue;

        // Fire the SET command
        await ctx.runAction(internal.ecoflow.setDeviceQuotaInternal, {
          deviceSn: device.deviceSn,
          moduleType: schedule.action.moduleType,
          operateType: schedule.action.operateType,
          params: schedule.action.params,
        });

        // Mark as executed
        await ctx.runMutation(internal.schedules.markExecuted, {
          scheduleId: schedule._id,
          timestamp: now,
        });

        fired++;
      } catch (err) {
        const msg = `Schedule ${schedule.name} (${schedule._id}): ${err instanceof Error ? err.message : "Unknown error"}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    return { success: true, fired, errors };
  },
});
