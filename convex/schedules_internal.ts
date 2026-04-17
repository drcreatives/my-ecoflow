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
        // Compute current local time in the schedule's timezone
        const localDate = new Date(
          new Date(now).toLocaleString("en-US", { timeZone: schedule.timezone })
        );
        const localHH = String(localDate.getHours()).padStart(2, "0");
        const localMM = String(localDate.getMinutes()).padStart(2, "0");
        const localTime = `${localHH}:${localMM}`;
        const localDay = localDate.getDay(); // 0=Sun..6=Sat

        // Check time match
        if (localTime !== schedule.time) continue;

        // Check day-of-week match (empty = every day)
        if (schedule.daysOfWeek.length > 0 && !schedule.daysOfWeek.includes(localDay)) continue;

        // Prevent double-execution within the same minute
        if (schedule.lastExecutedAt) {
          const lastLocal = new Date(
            new Date(schedule.lastExecutedAt).toLocaleString("en-US", {
              timeZone: schedule.timezone,
            })
          );
          const lastHH = String(lastLocal.getHours()).padStart(2, "0");
          const lastMM = String(lastLocal.getMinutes()).padStart(2, "0");
          if (
            `${lastHH}:${lastMM}` === localTime &&
            lastLocal.toDateString() === localDate.toDateString()
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

    if (fired > 0 || errors.length > 0) {
      console.log(`Schedules processed: ${fired} fired, ${errors.length} errors`);
    }

    return { success: true, fired, errors };
  },
});
