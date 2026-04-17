# Plan: Full Device Control & Scheduled Settings

## TL;DR

Implement all 17 EcoFlow SET commands (port toggles, AC config, charging, standby timers, LCD, BMS/UPS, energy management, Smart Generator) plus user-defined scheduled rules (time-of-day + day-of-week) with a cron-based execution engine. Quick toggles on device details; config forms + schedules on device settings.

---

## Architecture

### API Command Layer

All 17 EcoFlow SET commands routed through a single generic Convex action `setDeviceQuota` that accepts moduleType, operateType, and params. Individual typed wrapper actions for type safety.

### Scheduling Engine

- New `deviceSchedules` table: stores rules like "set AC off at 11 PM on weekdays"
- Existing 1-minute cron tick checks schedule rules, computes if any should fire now
- Tick-based approach is simpler and more reliable for recurring rules than one-shot `ctx.scheduler.runAt()`

### UI Split

- **Device Details page**: Quick toggles for AC, DC/USB, 12V DC, X-Boost, buzzer
- **Device Settings page**: Config forms (charging rate, standby timers, LCD, BMS/UPS, energy mgmt, Smart Generator) + Schedule management UI

---

## EcoFlow API Commands — Full Catalog

### MPPT (moduleType: 5)

1. `quietMode` — Buzzer silent mode (enabled: 0|1) → `mppt.beepState`
2. `mpptCar` — Car charger switch (enabled: 0|1) → `mppt.carState`
3. `acOutCfg` — AC output + X-Boost (enabled, xboost, out_voltage, out_freq) → `mppt.cfgAcEnabled`, `mppt.cfgAcXboost`, `mppt.cfgAcOutVol`, `mppt.cfgAcOutFreq`
4. `acChgCfg` — AC charging settings (chgWatts, chgPauseFlag: 0|1) → `mppt.cfgChgWatts`, `mppt.chgPauseFlag`
5. `standbyTime` — AC standby time (standbyMins, 0=never, default 720) → `mppt.acStandbyMins`
6. `carStandby` — CAR standby time (standbyMins) → `mppt.carStandbyMin`
7. `dcChgCfg` — 12V DC charging current (dcChgCfg: 4000–10000 mA) → `mppt.dcChgCurrent`

### PD (moduleType: 1)

8. `standbyTime` — Unit standby time (standbyMin, 0=never) → `pd.standbyMin`
9. `dcOutCfg` — DC/USB switch (enabled: 0|1) → `pd.dcOutState`
10. `lcdCfg` — LCD settings (delayOff: seconds, brighLevel: must be 3) → `pd.lcdOffSec`, `pd.brightLevel`
11. `pvChangePrio` — Solar charging priority (pvChangeSet: 0|1) → `pd.pvChgPrioSet`
12. `watthConfig` — Energy management (isConfig: 0|1, bpPowerSoc: %) → `pd.watchIsConfig`, `pd.bpPowerSoc`
13. `acAutoOutConfig` — AC always on (acAutoOutConfig: 0|1, minAcOutSoc: %) → `pd.acAutoOutConfig`, `pd.minAcoutSoc`

### BMS (moduleType: 2)

14. `upsConfig` — Max charge SoC (maxChgSoc: %) → `bms_emsStatus.maxChargeSoc`
15. `dsgCfg` — Min discharge SoC (minDsgSoc: %) → `bms_emsStatus.minDsgSoc`
16. `openOilSoc` — Smart Gen ON threshold (openOilSoc: %) → `bms_emsStatus.minOpenOilEb`
17. `closeOilSoc` — Smart Gen OFF threshold (closeOilSoc: %) → `bms_emsStatus.maxCloseOilEb`

---

## Steps

### Phase 1: Backend — Generic EcoFlow SET Command Infrastructure

**File:** `convex/ecoflow.ts`

1. **`flattenParams()` helper** — Flatten nested JSON body into sorted key-value pairs for PUT signature generation (EcoFlow doc Step 2: `params.enabled=1&sn=XXX`).

2. **`setDeviceQuota()` helper** — Sends PUT to `/iot-open/sign/device/quota` with signed JSON body. Returns success/failure.

3. **Public `setDeviceQuota` action** — Auth-gated, validates device ownership via `ctx.runQuery`, accepts `deviceSn: string`, `moduleType: number`, `operateType: string`, `params: object`. Calls the PUT helper. Returns `{ success: boolean, error?: string }`.

4. **Typed wrapper actions** for UI calls:
   - `setPortState` — AC/DC/USB/car charger toggles
   - `setAcConfig` — AC output settings (enabled, xboost, voltage, frequency)
   - `setChargingConfig` — AC charging watts, pause flag, DC charging current
   - `setStandbyTimers` — AC standby, CAR standby, unit standby
   - `setLcdConfig` — LCD timeout and brightness
   - `setEnergyManagement` — Energy mgmt enable, backup reserve, solar priority, AC always on
   - `setBmsConfig` — Max charge SoC, min discharge SoC
   - `setSmartGenerator` — Open/close oil SoC thresholds
   - `setBuzzer` — Silent mode toggle

### Phase 2: Backend — Read Config State from Readings Pipeline

**Files:** `convex/schema.ts`, `convex/ecoflow.ts`, `convex/readings.ts`

5. **Add ~15 config state fields to `deviceReadings` schema** — Port states (`acEnabled`, `dcOutEnabled`, `carChargerEnabled`), AC config (`acXboost`, `acOutVoltage`, `acOutFrequency`), charging (`acChargingWatts`, `dcChargingCurrent`), standby timers (`acStandbyMins`, `carStandbyMins`, `unitStandbyMins`), BMS limits (`maxChargeSoc`, `minDischargeSoc`), energy mgmt flags (`solarPriority`, `energyMgmtEnabled`, `backupReserveSoc`), Smart Gen thresholds (`smartGenOnSoc`, `smartGenOffSoc`), LCD timeout (`lcdOffSeconds`), buzzer state (`buzzerSilent`).

6. **Update `transformQuotaToReading()`** — Extract all config quotas already being fetched every minute.

7. **Update `insertReading` mutation** — Add all new optional fields to args + handler in `readings.ts`.

8. **Wire new fields through `collectAllUserReadings`** — Pass config state from transform → insert.

### Phase 3: Backend — Scheduled Rules Engine

**Files:** `convex/schema.ts`, **new** `convex/schedules.ts`, `convex/crons.ts`

9. **New `deviceSchedules` table** — Fields:
   - `deviceId: v.id("devices")`
   - `userId: v.id("users")`
   - `name: v.string()` — user-friendly label (e.g. "Night mode")
   - `enabled: v.boolean()`
   - `time: v.string()` — "HH:MM" in 24h format
   - `daysOfWeek: v.array(v.number())` — 0=Sun, 1=Mon, ..., 6=Sat; empty array = every day
   - `action: v.object(...)` — `{ moduleType, operateType, params }` — the EcoFlow command to execute
   - `timezone: v.string()` — e.g. "America/New_York" (needed to compute correct local day/time)
   - `lastExecutedAt: v.optional(v.float64())` — prevent double-execution within same minute
   - `createdAt: v.float64()`
   - `updatedAt: v.float64()`
   - Indexes: `by_deviceId`, `by_userId`
   - Max 5 per device (enforced in create mutation)

10. **Create `convex/schedules.ts`** — CRUD mutations + queries:
    - `list(deviceId)` — query all schedules for a device (auth-gated)
    - `create(deviceId, name, time, daysOfWeek, action, timezone)` — with 5-per-device limit
    - `update(scheduleId, ...)` — partial update
    - `remove(scheduleId)` — delete
    - `internalList()` — internal query for cron to fetch all enabled schedules

11. **Create `processSchedules` internal action** — Called by cron every minute:
    - Fetch all enabled schedules via internal query
    - For each schedule, compute current local time using `timezone`
    - Check if `time` matches current HH:MM AND current day matches `daysOfWeek` (or daysOfWeek is empty)
    - Check `lastExecutedAt` to prevent re-execution within the same minute
    - If match: call `setDeviceQuota` helper with the stored action params
    - Update `lastExecutedAt` via internal mutation

12. **Add cron entry in `crons.ts`** — 1-minute interval for `processSchedules` (parallel with existing `collect-readings` tick).

### Phase 4: Frontend — Types & Hooks

**Files:** `src/types/index.ts`, `src/lib/data-utils.ts`, `src/hooks/useConvexData.ts`

13. **Expand `DeviceReading` type** — Add all new config state fields (acEnabled, acXboost, etc.).

14. **Add `DeviceSchedule` type** — Schedule rule interface.

15. **`useConvexDeviceControl()` hook** — Typed methods:
    - `setPort(deviceSn, port, enabled)`
    - `setAcConfig(deviceSn, { enabled, xboost, voltage, frequency })`
    - `setChargingConfig(deviceSn, { chgWatts, chgPauseFlag, dcChgCurrent })`
    - `setStandbyTimers(deviceSn, { acStandby, carStandby, unitStandby })`
    - `setLcdConfig(deviceSn, { delayOff, brightness })`
    - `setEnergyManagement(deviceSn, { ... })`
    - `setBmsConfig(deviceSn, { maxChargeSoc, minDischargeSoc })`
    - `setSmartGenerator(deviceSn, { onSoc, offSoc })`
    - `setBuzzer(deviceSn, enabled)`

16. **`useConvexSchedules()` hook** — CRUD for schedules:
    - `schedules` — reactive list via useQuery
    - `createSchedule(...)`, `updateSchedule(...)`, `deleteSchedule(...)`

### Phase 5: Device Details Page — Quick Toggles

**File:** `src/app/(dashboard)/device/[deviceId]/page.tsx`

17. **Port toggles in Power Output Breakdown** — AC, DC/USB, 12V DC using existing `Toggle` component. Optimistic local state, Sonner toast on error, disabled when offline.

18. **X-Boost toggle** — Secondary toggle inside the AC output card.

19. **Buzzer toggle** — In Device Status or Quick Actions section.

### Phase 6: Device Settings Page — Config Forms + Schedules

**File:** `src/app/(dashboard)/device/[deviceId]/settings/page.tsx`

20. **AC Output Configuration section** — Voltage dropdown (120V/230V), frequency dropdown (50/60 Hz).

21. **Charging Configuration section** — AC charging watts input, charging pause toggle, 12V DC current slider (4000–10000 mA).

22. **Standby Timers section** — Three inputs: AC standby (minutes, 0=never), CAR standby (minutes), Unit standby (minutes). Explain defaults.

23. **LCD Settings section** — Screen timeout input (seconds). Note: brightness must be 3.

24. **Energy Management section** — Toggle for energy management enable, slider for backup reserve SoC %, toggle for solar charging priority, toggle + SoC input for AC always on.

25. **BMS / UPS Configuration section** — Slider for max charge SoC %, slider for min discharge SoC %.

26. **Smart Generator section** — Two SoC inputs: turn ON threshold, turn OFF threshold.

27. **Scheduled Rules section** — List of schedule cards with:
    - Name, time, days-of-week chips, action summary, enabled toggle
    - "Add Schedule" button → modal/inline form:
      - Name input
      - Time picker (HH:MM)
      - Day-of-week chip selector (Mon–Sun, multi-select, empty = daily)
      - Action picker: dropdown of available commands → dynamic param form
      - Timezone auto-detected from browser, displayed but editable
    - Edit/delete on existing schedules
    - Max 5 indicator

### Phase 7: Cleanup — Delete Schedules on Device Removal

**File:** `convex/devices.ts`

28. **Add schedule cleanup to `remove` mutation** — Delete all `deviceSchedules` entries when a device is unregistered (follows existing pattern for deviceSettings, alerts, etc.).

### Phase 8: Verification

29. `npm run type-check` + `npm run lint`
30. Manual verification:
    - Toggle each port on details page — verify optimistic UI + toast on error
    - Change AC voltage/frequency on settings — verify API call
    - Set charging rate, standby timers, BMS limits — verify round-trip
    - Create a schedule rule → wait for it to fire → verify device state changed
    - Delete device → verify schedules cleaned up
    - Offline device → verify toggles/forms are disabled

---

## Relevant Files

### Backend (Convex)

- `convex/ecoflow.ts` — `flattenParams()`, `setDeviceQuota()` PUT helper, all typed wrapper actions, update `transformQuotaToReading()` with config state fields
- `convex/schema.ts` — Add config fields to `deviceReadings`, new `deviceSchedules` table
- `convex/readings.ts` — Add config fields to `insertReading` mutation
- `convex/schedules.ts` — **NEW** — CRUD mutations/queries for schedule rules, `processSchedules` internal action
- `convex/crons.ts` — Add `process-schedules` 1-minute interval
- `convex/devices.ts` — Add schedule cleanup to `remove` mutation

### Frontend

- `src/types/index.ts` — `DeviceReading` expanded fields, new `DeviceSchedule` type
- `src/lib/data-utils.ts` — Update DeviceReading type if duplicated here
- `src/hooks/useConvexData.ts` — `useConvexDeviceControl()`, `useConvexSchedules()` hooks
- `src/app/(dashboard)/device/[deviceId]/page.tsx` — Port toggles, X-Boost, buzzer in Power Output Breakdown
- `src/app/(dashboard)/device/[deviceId]/settings/page.tsx` — Config form sections + schedule management UI
- `src/components/ui/Toggle.tsx` — Reuse as-is
- `src/components/ui/ChipSelector.tsx` — Reuse for day-of-week selection

---

## Decisions

- **Single generic `setDeviceQuota` action + typed wrappers** — avoids 17 separate Convex action files
- **Config state in `deviceReadings`** — no separate table; quota data already fetched every minute, just extract more fields
- **Tick-based scheduling** (1-min cron checks rules) over `ctx.scheduler.runAt()` — recurring rules need re-scheduling; tick approach is simpler and self-healing
- **Timezone stored per schedule** — essential for correct day-of-week + time matching
- **`lastExecutedAt` guard** — prevents double-firing within the same minute tick
- **Max 5 schedules per device** — keeps cron processing lightweight
- **LCD brightness hardcoded to 3** — per EcoFlow docs, other values are invalid; UI can note this
- **Split UI** — quick toggles on details page for instant control; config forms on settings for thoughtful changes
- **AC voltage/frequency as dropdowns** — 120V/230V and 50/60 Hz
- **Smart Generator included** — openOilSoc/closeOilSoc thresholds

## Dependency Graph

- Phase 1 (PUT infra) → blocks Phase 2, 3, 5, 6
- Phase 2 (read config state) → parallel with Phase 1 step 3+
- Phase 3 (schedules engine) → depends on Phase 1
- Phase 4 (types/hooks) → depends on Phase 1 action signatures
- Phase 5 (details UI) → depends on Phase 4
- Phase 6 (settings UI) → depends on Phase 4 + Phase 3
- Phase 7 (cleanup) → independent, can run anytime
- Phase 8 (verification) → after all phases
