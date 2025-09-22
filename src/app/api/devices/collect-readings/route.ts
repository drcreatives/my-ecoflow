import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { executeQuery } from '@/lib/database'

/**
 * Background job endpoint to collect and store device readings
 * This can be called periodically by a cron job or monitoring system
 */
export async function POST(_request: NextRequest) {
  try {
    console.log('📊 Starting background reading collection...')
    
    // Verify authentication (could be a service account or API key)
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get all devices for this user using direct PostgreSQL
    const devices = await executeQuery<{
      id: string
      deviceSn: string
      deviceName: string
      userId: string
    }>(`
      SELECT id, device_sn as "deviceSn", device_name as "deviceName", user_id as "userId"
      FROM devices
      WHERE user_id = $1
    `, [user.id])

    if (devices.length === 0) {
      console.log('ℹ️ No devices found for user')
      return NextResponse.json({
        message: 'No devices found',
        collected: 0 
      })
    }

    let successCount = 0
    let errorCount = 0
    const results = []

    // Collect readings for each device
    for (const device of devices) {
      try {
        console.log(`📡 Fetching reading for device: ${device.deviceSn}`)
        
        // Get current reading from EcoFlow API
        const quota = await ecoflowAPI.getDeviceQuota(device.deviceSn)
        if (!quota || !quota.quotaMap) {
          console.warn(`⚠️ No quota data for device: ${device.deviceSn}`)
          errorCount++
          continue
        }

        // Transform to reading format
        const reading = ecoflowAPI.transformQuotaToReading(quota, device.id)
        
        if (!reading) {
          console.warn(`⚠️ Could not transform quota data for device: ${device.deviceSn}`)
          errorCount++
          continue
        }
        
        // DEBUG: Log the transformed reading values
        console.log(`🔍 [DEBUG] Transformed reading for ${device.deviceSn}:`, {
          acOutputWatts: reading.acOutputWatts,
          dcOutputWatts: reading.dcOutputWatts,
          usbOutputWatts: reading.usbOutputWatts,
          outputWatts: reading.outputWatts,
          batteryLevel: reading.batteryLevel
        })
        
        // Save to database using direct PostgreSQL
        const savedReading = await executeQuery<{
          id: string
        }>(`
          INSERT INTO device_readings (
            id,
            device_id, 
            battery_level, 
            input_watts, 
            output_watts,
            ac_output_watts,
            dc_output_watts,
            usb_output_watts,
            remaining_time, 
            temperature, 
            status, 
            raw_data,
            recorded_at
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            NOW()
          )
          RETURNING id
        `, [
          device.id,
          reading.batteryLevel || 0,
          reading.inputWatts || 0,
          reading.outputWatts || 0,
          reading.acOutputWatts || 0,
          reading.dcOutputWatts || 0,
          reading.usbOutputWatts || 0,
          reading.remainingTime,
          reading.temperature || 0,
          reading.status || 'unknown',
          JSON.stringify(reading.rawData || {})
        ])

        console.log(`✅ Saved reading for ${device.deviceSn} - Battery: ${reading.batteryLevel}%`)
        console.log(`🔍 [DEBUG] Inserted values: AC:${reading.acOutputWatts}, DC:${reading.dcOutputWatts}, USB:${reading.usbOutputWatts}`)
        
        results.push({
          deviceSn: device.deviceSn,
          deviceName: device.deviceName,
          readingId: savedReading[0].id,
          batteryLevel: reading.batteryLevel,
          outputWatts: reading.outputWatts,
          acOutputWatts: reading.acOutputWatts,
          dcOutputWatts: reading.dcOutputWatts,
          usbOutputWatts: reading.usbOutputWatts,
          status: reading.status
        })
        
        successCount++
        
      } catch (error) {
        console.error(`❌ Error collecting reading for ${device.deviceSn}:`, error)
        errorCount++
        results.push({
          deviceSn: device.deviceSn,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`📊 Collection complete: ${successCount} success, ${errorCount} errors`)

    const result = {
      message: 'Reading collection completed',
      timestamp: new Date().toISOString(),
      summary: {
        totalDevices: devices.length,
        successful: successCount,
        failed: errorCount
      },
      results
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('❌ Error in reading collection:', error)
    
    return NextResponse.json({
      error: 'Failed to collect readings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}