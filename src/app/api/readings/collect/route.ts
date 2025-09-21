import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Background job endpoint to collect and store device readings
 * This can be called periodically to build historical data
 */
export async function POST(_request: NextRequest) {
  try {
    console.log('📊 Starting background readings collection...')
    
    const supabase = await createServerSupabaseClient()
    
    // Get all registered devices from database
    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .select('*')
      .eq('is_active', true)

    if (devicesError) {
      console.error('Failed to fetch devices:', devicesError)
      return NextResponse.json(
        { error: 'Failed to fetch devices' },
        { status: 500 }
      )
    }

    if (!devices || devices.length === 0) {
      return NextResponse.json({
        message: 'No active devices found',
        collected: 0
      })
    }

    let successCount = 0
    let errorCount = 0
    const results = []

    // Collect readings for each device
    for (const device of devices) {
      try {
        console.log(`📡 Collecting reading for device: ${device.device_sn}`)
        
        const quota = await ecoflowAPI.getDeviceQuota(device.device_sn)
        
        if (quota && quota.quotaMap) {
          // Helper function to get quota value
          const getQuotaValue = (key: string): number => {
            const value = quota.quotaMap[key]
            if (!value || typeof value.val !== 'number') return 0
            return value.scale ? value.val / Math.pow(10, value.scale) : value.val
          }

          // Extract current reading data
          const readingData = {
            device_id: device.id,
            battery_level: getQuotaValue('bms_bmsStatus.soc') || getQuotaValue('pd.soc') || 0,
            input_watts: getQuotaValue('inv.inputWatts') || getQuotaValue('pd.wattsInSum') || 0,
            output_watts: getQuotaValue('pd.wattsOutSum') || getQuotaValue('inv.outputWatts') || 0, // Total output (AC + DC)
            remaining_time: getQuotaValue('pd.remainTime') || null,
            temperature: getQuotaValue('bms_bmsStatus.temp') || null,
            status: 'connected',
            raw_data: quota.quotaMap,
            recorded_at: new Date().toISOString()
          }

          // Save to database
          const { error: insertError } = await supabase
            .from('device_readings')
            .insert(readingData)

          if (insertError) {
            console.error(`❌ Failed to save reading for ${device.device_sn}:`, insertError)
            errorCount++
            results.push({
              deviceSn: device.device_sn,
              success: false,
              error: insertError.message
            })
          } else {
            console.log(`✅ Saved reading for ${device.device_sn}`)
            successCount++
            results.push({
              deviceSn: device.device_sn,
              success: true,
              data: {
                batteryLevel: readingData.battery_level,
                inputWatts: readingData.input_watts,
                outputWatts: readingData.output_watts,
                temperature: readingData.temperature,
                remainingTime: readingData.remaining_time
              }
            })
          }
        } else {
          console.error(`❌ No quota data for device ${device.device_sn}`)
          errorCount++
          results.push({
            deviceSn: device.device_sn,
            success: false,
            error: 'No quota data available'
          })
        }

        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.error(`❌ Error collecting reading for ${device.device_sn}:`, error)
        errorCount++
        results.push({
          deviceSn: device.device_sn,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`📊 Readings collection complete: ${successCount} success, ${errorCount} errors`)

    return NextResponse.json({
      message: `Collected readings for ${devices.length} devices`,
      summary: {
        total: devices.length,
        success: successCount,
        errors: errorCount
      },
      results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Background readings collection error:', error)
    return NextResponse.json({
      error: 'Failed to collect readings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Get the status of the readings collection service
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get counts and latest readings
    const { data: deviceCount } = await supabase
      .from('devices')
      .select('id', { count: 'exact' })
      .eq('is_active', true)

    const { data: readingCount } = await supabase
      .from('device_readings')
      .select('id', { count: 'exact' })

    const { data: latestReadings } = await supabase
      .from('device_readings')
      .select('device_id, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
      status: 'operational',
      stats: {
        activeDevices: deviceCount?.length || 0,
        totalReadings: readingCount?.length || 0,
        latestReadings: latestReadings || []
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Readings service status error:', error)
    return NextResponse.json({
      error: 'Failed to get service status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}