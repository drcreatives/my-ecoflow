import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { executeQuery } from '@/lib/database'

/**
 * User-scoped reading collection endpoint.
 *
 * Authenticates the caller via Supabase session cookies so it works from both
 * the foreground interval collector and the service worker (which sends
 * `credentials: 'include'`).
 *
 * POST /api/devices/collect-readings/self
 */
export async function POST(_request: NextRequest) {
  try {
    // --- Auth -----------------------------------------------------------
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // --- Interval check -------------------------------------------------
    // Respect the user's collection_interval_minutes to avoid over-collecting.
    const retentionRows = await executeQuery<{
      collection_interval_minutes: number
    }>(
      'SELECT collection_interval_minutes FROM data_retention_settings WHERE user_id = $1',
      [userId]
    )

    const intervalMinutes = retentionRows[0]?.collection_interval_minutes ?? 5

    // Check when the most recent reading was stored for any of this user's
    // devices.  If it is within the configured interval we skip (unless the
    // caller explicitly passes ?force=true).
    const forceCollection =
      new URL(_request.url).searchParams.get('force') === 'true'

    if (!forceCollection) {
      const lastReadingRows = await executeQuery<{ last_recorded: string }>(
        `SELECT MAX(dr.recorded_at) AS last_recorded
         FROM device_readings dr
         JOIN devices d ON d.id = dr.device_id
         WHERE d.user_id = $1`,
        [userId]
      )

      const lastRecorded = lastReadingRows[0]?.last_recorded
      if (lastRecorded) {
        const elapsed = Date.now() - new Date(lastRecorded).getTime()
        if (elapsed < intervalMinutes * 60 * 1000) {
          return NextResponse.json({
            message: 'Skipped – within collection interval',
            nextCollectionIn: Math.ceil(
              (intervalMinutes * 60 * 1000 - elapsed) / 1000
            ),
          })
        }
      }
    }

    // --- Fetch devices --------------------------------------------------
    const devices = await executeQuery<{
      id: string
      deviceSn: string
      deviceName: string
    }>(
      `SELECT id, device_sn AS "deviceSn", device_name AS "deviceName"
       FROM devices WHERE user_id = $1`,
      [userId]
    )

    if (devices.length === 0) {
      return NextResponse.json({
        message: 'No devices registered',
        collected: 0,
      })
    }

    // --- Collect --------------------------------------------------------
    let successCount = 0
    let errorCount = 0
    const results: Record<string, unknown>[] = []

    for (const device of devices) {
      try {
        const quota = await ecoflowAPI.getDeviceQuota(device.deviceSn)
        if (!quota?.quotaMap) {
          errorCount++
          continue
        }

        const reading = ecoflowAPI.transformQuotaToReading(quota, device.id)
        if (!reading) {
          errorCount++
          continue
        }

        const saved = await executeQuery<{ id: string }>(
          `INSERT INTO device_readings (
             id, device_id, battery_level, input_watts, output_watts,
             ac_output_watts, dc_output_watts, usb_output_watts,
             remaining_time, temperature, status, raw_data, recorded_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
           ) RETURNING id`,
          [
            device.id,
            reading.batteryLevel ?? 0,
            reading.inputWatts ?? 0,
            reading.outputWatts ?? 0,
            reading.acOutputWatts ?? 0,
            reading.dcOutputWatts ?? 0,
            reading.usbOutputWatts ?? 0,
            reading.remainingTime,
            reading.temperature ?? 0,
            reading.status ?? 'unknown',
            JSON.stringify(reading.rawData ?? {}),
          ]
        )

        successCount++
        results.push({
          deviceSn: device.deviceSn,
          readingId: saved[0].id,
          batteryLevel: reading.batteryLevel,
          outputWatts: reading.outputWatts,
        })
      } catch (err) {
        errorCount++
        results.push({
          deviceSn: device.deviceSn,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      message: 'Collection completed',
      timestamp: new Date().toISOString(),
      summary: {
        devices: devices.length,
        successful: successCount,
        failed: errorCount,
      },
      results,
    })
  } catch (error) {
    console.error('collect-readings/self error:', error)
    return NextResponse.json(
      {
        error: 'Failed to collect readings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
