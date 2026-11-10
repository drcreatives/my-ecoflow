import { ConvexError, v } from "convex/values";
import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { auth } from "./auth";
import {
  connectivityValidator, eventTypeValidator, createMockMeter, isMeterActive,
  settleMeter, validateUnits, validateRequestId, MOCK_METER_COUNT, MOCK_READING_LIMIT,
  READING_INTERVAL_MS, SIMULATION_INTERVAL_MS, INACTIVE_SIMULATION_AT,
  type MockMeter,
} from "./mockMeterModel";

const publicMeterValidator = v.object({
  id: v.id("mockMeters"),
  meterNumber: v.string(),
  customerName: v.string(),
  location: v.string(),
  connectivity: connectivityValidator,
  isActive: v.boolean(),
  deactivationReason: v.union(v.literal("manual"), v.literal("balance"), v.null()),
  balanceWh: v.number(),
  purchasedWh: v.number(),
  usedWh: v.number(),
  paidKobo: v.number(),
  tariffKoboPerKwh: v.number(),
  loadWatts: v.number(),
  lastSeenAt: v.number(),
  updatedAt: v.number(),
});

const operationResultValidator = v.object({
  balanceWh: v.number(), activated: v.boolean(), duplicate: v.boolean(),
});

function publicMeter(meter: Doc<"mockMeters">) {
  return {
    id: meter._id,
    meterNumber: meter.meterNumber,
    customerName: meter.customerName,
    location: meter.location,
    connectivity: meter.connectivity,
    isActive: isMeterActive(meter),
    deactivationReason: meter.manualHold ? "manual" as const : meter.balanceWh === 0 ? "balance" as const : null,
    balanceWh: meter.balanceWh,
    purchasedWh: meter.purchasedWh,
    usedWh: meter.usedWh,
    paidKobo: meter.paidKobo,
    tariffKoboPerKwh: meter.tariffKoboPerKwh,
    loadWatts: isMeterActive(meter) ? meter.loadWatts : 0,
    lastSeenAt: meter.lastSeenAt,
    updatedAt: meter.updatedAt,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  returns: v.array(publicMeterValidator),
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    const meters = await ctx.db.query("mockMeters")
      .withIndex("by_userId", q => q.eq("userId", userId)).take(MOCK_METER_COUNT);
    return meters.map(publicMeter);
  },
});

export const get = query({
  args: { meterId: v.id("mockMeters") },
  returns: v.union(v.null(), v.object({
    meter: publicMeterValidator,
    events: v.array(v.object({
      id: v.id("mockMeterEvents"), type: eventTypeValidator, unitsWh: v.number(),
      amountKobo: v.number(), balanceWh: v.number(), message: v.string(), createdAt: v.number(),
    })),
    readings: v.array(v.object({
      recordedAt: v.number(), loadWatts: v.number(), usedWh: v.number(), balanceWh: v.number(),
    })),
  })),
  handler: async (ctx, { meterId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const meter = await ctx.db.get(meterId);
    if (!meter || meter.userId !== userId) return null;
    const [events, readings] = await Promise.all([
      ctx.db.query("mockMeterEvents").withIndex("by_meterId_createdAt", q => q.eq("meterId", meterId))
        .order("desc").take(50),
      ctx.db.query("mockMeterReadings").withIndex("by_meterId_recordedAt", q => q.eq("meterId", meterId))
        .order("desc").take(MOCK_READING_LIMIT),
    ]);
    return {
      meter: publicMeter(meter),
      events: events.map(event => ({
        id: event._id, type: event.type, unitsWh: event.unitsWh, amountKobo: event.amountKobo,
        balanceWh: event.balanceWh, message: event.message, createdAt: event.createdAt,
      })),
      readings: readings.reverse().map(reading => ({
        recordedAt: reading.recordedAt, loadWatts: reading.loadWatts,
        usedWh: reading.usedWh, balanceWh: reading.balanceWh,
      })),
    };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const seed = mutation({
  args: {},
  returns: v.object({ created: v.boolean(), count: v.number() }),
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const existing = await ctx.db.query("mockMeters")
      .withIndex("by_userId", q => q.eq("userId", userId)).take(MOCK_METER_COUNT);
    if (existing.length > 0) return { created: false, count: existing.length };
    const now = Date.now();
    for (let index = 0; index < MOCK_METER_COUNT; index++) {
      const meter = createMockMeter(userId, index, now);
      meter.readingCount = 24;
      const meterId = await ctx.db.insert("mockMeters", meter);
      await recordEvent(ctx, meterId, meter, "seed", now, {
        unitsWh: meter.purchasedWh,
        amountKobo: meter.paidKobo,
        message: "Demo meter created with a fictional prepaid balance and usage history.",
      });
      for (let hour = 0; hour < 24; hour++) {
        const hoursAgo = 23 - hour;
        const priorUsageWh = Math.max(0, meter.usedWh - hoursAgo * meter.loadWatts);
        await ctx.db.insert("mockMeterReadings", {
          meterId,
          recordedAt: meter.lastSeenAt - hoursAgo * 3_600_000,
          loadWatts: hoursAgo > 0 || isMeterActive(meter)
            ? Math.round(meter.loadWatts * (0.75 + (hour % 5) * 0.1)) : 0,
          usedWh: priorUsageWh,
          balanceWh: meter.purchasedWh - priorUsageWh,
        });
      }
    }
    return { created: true, count: MOCK_METER_COUNT };
  },
});

const operationArgs = { meterId: v.id("mockMeters"), requestId: v.string() };

export const topUp = mutation({
  args: { ...operationArgs, unitsWh: v.number() },
  returns: operationResultValidator,
  handler: (ctx, args) => applyOperation(ctx, { ...args, type: "top_up" }),
});

export const setManualHold = mutation({
  args: { ...operationArgs, held: v.boolean() },
  returns: operationResultValidator,
  handler: (ctx, args) => applyOperation(ctx, {
    ...args, type: args.held ? "manual_deactivation" : "manual_activation", unitsWh: 0,
  }),
});

export const simulateUsage = mutation({
  args: { ...operationArgs, unitsWh: v.number() },
  returns: operationResultValidator,
  handler: (ctx, args) => applyOperation(ctx, { ...args, type: "simulated_usage" }),
});

// ─── Background simulation ────────────────────────────────────────────────────

export const simulateFleet = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (process.env.DISABLE_CRONS === "true" || process.env.DISABLE_MOCK_METER_SIMULATION === "true") return null;
    const now = Date.now();
    // Oldest-due ordering makes repeated bounded batches fair across all owners.
    const meters = await ctx.db.query("mockMeters")
      .withIndex("by_nextSimulationAt", q => q.lte("nextSimulationAt", now))
      .take(MOCK_METER_COUNT);
    for (const meter of meters) {
      const settled = settleMeter(meter, now);
      await recordCutoff(ctx, meter._id, meter, settled, now);
      await persistMeter(ctx, meter._id, settled, now, isMeterActive(meter) !== isMeterActive(settled));
    }
    return null;
  },
});

// ─── Transaction helpers ──────────────────────────────────────────────────────

type OperationType = "top_up" | "simulated_usage" | "manual_deactivation" | "manual_activation";
interface Operation {
  meterId: Id<"mockMeters">;
  requestId: string;
  type: OperationType;
  unitsWh: number;
}

async function applyOperation(ctx: MutationCtx, operation: Operation) {
  const userId = await auth.getUserId(ctx);
  if (!userId) throw new Error("Unauthorized");
  const original = await ctx.db.get(operation.meterId);
  if (!original || original.userId !== userId) throw new ConvexError("Meter not found");
  validateRequestId(operation.requestId);
  if (operation.type === "top_up" || operation.type === "simulated_usage") validateUnits(operation.unitsWh);
  const requestKey = `${operation.type}:${operation.meterId}:${operation.unitsWh}`;
  const duplicate = await ctx.db.query("mockMeterEvents")
    .withIndex("by_userId_requestId", q => q.eq("userId", userId).eq("requestId", operation.requestId)).first();
  if (duplicate) {
    if (duplicate.requestKey !== requestKey) throw new ConvexError("This request identifier was already used for another operation.");
    return { balanceWh: duplicate.balanceWh, activated: duplicate.activated, duplicate: true };
  }

  const now = Math.max(Date.now(), original.lastSettledAt);
  const settledBeforeOperation = settleMeter(original, now);
  const meter = { ...settledBeforeOperation };
  const activeBeforeOperation = isMeterActive(meter);
  let unitsWh = operation.unitsWh;
  let amountKobo = 0;
  let message: string;
  switch (operation.type) {
    case "top_up":
      amountKobo = Math.round(unitsWh * meter.tariffKoboPerKwh / 1_000);
      if (!Number.isSafeInteger(meter.purchasedWh + unitsWh) || !Number.isSafeInteger(meter.paidKobo + amountKobo)) {
        throw new ConvexError("The resulting balance is too large.");
      }
      meter.balanceWh += unitsWh;
      meter.purchasedWh += unitsWh;
      meter.paidKobo += amountKobo;
      message = meter.manualHold ? "Mock recharge credited. The administrator hold remains active." : "Mock recharge credited successfully.";
      break;
    case "simulated_usage":
      if (!activeBeforeOperation) throw new ConvexError("Activate the meter and add credit before simulating usage.");
      unitsWh = Math.min(unitsWh, meter.balanceWh);
      meter.balanceWh -= unitsWh;
      meter.usedWh += unitsWh;
      if (meter.balanceWh === 0) meter.remainderWattMs = 0;
      message = "Demo electricity consumption applied.";
      break;
    case "manual_deactivation":
      meter.manualHold = true;
      message = "Electricity supply paused by the administrator.";
      break;
    case "manual_activation":
      if (meter.balanceWh === 0) throw new ConvexError("Recharge this meter before activating it.");
      meter.manualHold = false;
      message = "Electricity supply restored by the administrator.";
      break;
  }

  // All writes, including the receipt, commit together and participate in Convex OCC.
  await recordCutoff(ctx, operation.meterId, original, settledBeforeOperation, now);
  await recordEvent(ctx, operation.meterId, meter, operation.type, now, {
    unitsWh, amountKobo, message, requestId: operation.requestId, requestKey,
  });
  if (operation.type === "simulated_usage") {
    await recordCutoff(ctx, operation.meterId, settledBeforeOperation, meter, now);
  }
  if (operation.type === "top_up" && !activeBeforeOperation && isMeterActive(meter)) {
    await recordEvent(ctx, operation.meterId, meter, "automatic_activation", now, {
      message: "Supply automatically restored after recharge.",
    });
  }
  await persistMeter(ctx, operation.meterId, meter, now, true);
  return { balanceWh: meter.balanceWh, activated: isMeterActive(meter), duplicate: false };
}

async function recordEvent(
  ctx: MutationCtx,
  meterId: Id<"mockMeters">,
  meter: MockMeter,
  type: Doc<"mockMeterEvents">["type"],
  now: number,
  details: { message: string; unitsWh?: number; amountKobo?: number; requestId?: string; requestKey?: string },
) {
  await ctx.db.insert("mockMeterEvents", {
    userId: meter.userId, meterId, type,
    unitsWh: details.unitsWh ?? 0,
    amountKobo: details.amountKobo ?? 0,
    balanceWh: meter.balanceWh,
    activated: isMeterActive(meter),
    message: details.message,
    ...(details.requestId ? { requestId: details.requestId, requestKey: details.requestKey } : {}),
    createdAt: now,
  });
}

async function recordCutoff(ctx: MutationCtx, meterId: Id<"mockMeters">, before: MockMeter, after: MockMeter, now: number) {
  if (isMeterActive(before) && after.balanceWh === 0) {
    await recordEvent(ctx, meterId, after, "automatic_deactivation", now, {
      message: "Prepaid units exhausted. Supply automatically switched off.",
    });
  }
}

async function persistMeter(ctx: MutationCtx, meterId: Id<"mockMeters">, meter: MockMeter, now: number, forceReading: boolean) {
  let readingCount = meter.readingCount;
  let lastReadingAt = meter.lastReadingAt;
  if (meter.connectivity === "online" && (forceReading || now - lastReadingAt >= READING_INTERVAL_MS)) {
    if (readingCount >= MOCK_READING_LIMIT) {
      const oldest = await ctx.db.query("mockMeterReadings")
        .withIndex("by_meterId_recordedAt", q => q.eq("meterId", meterId)).order("asc").first();
      if (oldest) await ctx.db.delete(oldest._id);
    } else {
      readingCount++;
    }
    await ctx.db.insert("mockMeterReadings", {
      meterId, recordedAt: now, loadWatts: isMeterActive(meter) ? meter.loadWatts : 0,
      usedWh: meter.usedWh, balanceWh: meter.balanceWh,
    });
    lastReadingAt = now;
  }
  await ctx.db.patch(meterId, {
    balanceWh: meter.balanceWh, purchasedWh: meter.purchasedWh, usedWh: meter.usedWh,
    paidKobo: meter.paidKobo, manualHold: meter.manualHold,
    remainderWattMs: meter.remainderWattMs, lastSettledAt: meter.lastSettledAt,
    nextSimulationAt: isMeterActive(meter) ? now + SIMULATION_INTERVAL_MS : INACTIVE_SIMULATION_AT,
    lastSeenAt: meter.lastSeenAt, updatedAt: meter.updatedAt, readingCount, lastReadingAt,
  });
}
