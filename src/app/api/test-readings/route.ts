import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Test endpoint to verify reading persistence and analytics
 */
export async function GET() {
  try {
    console.log('🧪 Testing reading persistence...')
    
    const supabase = await createServerSupabaseClient()
    
    // 1. Check if we have any devices
    const { data: devices, count: deviceCount } = await supabase
      .from('devices')
      .select('*', { count: 'exact' })
      .eq('is_active', true)

    // 2. Check if we have any readings
    const { data: readings, count: readingCount } = await supabase
      .from('device_readings')
      .select('*', { count: 'exact' })
      .order('recorded_at', { ascending: false })
      .limit(10)

    // 3. Get analytics summary if we have readings
    let analytics = null
    if (readings && readings.length > 0) {
      const { data: stats } = await supabase
        .from('device_readings')
        .select('battery_level, input_watts, output_watts, temperature, recorded_at')
        .gte('recorded_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('recorded_at', { ascending: false })

      if (stats && stats.length > 0) {
        analytics = {
          last24Hours: {
            count: stats.length,
            avgBatteryLevel: stats.reduce((sum, r) => sum + (r.battery_level || 0), 0) / stats.length,
            avgInputWatts: stats.reduce((sum, r) => sum + (r.input_watts || 0), 0) / stats.length,
            avgOutputWatts: stats.reduce((sum, r) => sum + (r.output_watts || 0), 0) / stats.length,
            avgTemperature: stats.reduce((sum, r) => sum + (r.temperature || 0), 0) / stats.length,
            maxBatteryLevel: Math.max(...stats.map(r => r.battery_level || 0)),
            minBatteryLevel: Math.min(...stats.map(r => r.battery_level || 0)),
            maxOutputWatts: Math.max(...stats.map(r => r.output_watts || 0)),
          }
        }
      }
    }

    return NextResponse.json({
      status: 'success',
      message: 'Reading persistence test completed',
      summary: {
        activeDevices: deviceCount || 0,
        totalReadings: readingCount || 0,
        hasReadings: (readingCount || 0) > 0,
        analyticsAvailable: analytics !== null
      },
      devices: devices?.map(d => ({
        id: d.id,
        deviceSn: d.device_sn,
        deviceName: d.device_name,
        isActive: d.is_active
      })) || [],
      latestReadings: readings?.map(r => ({
        id: r.id,
        deviceId: r.device_id,
        batteryLevel: r.battery_level,
        inputWatts: r.input_watts,
        outputWatts: r.output_watts,
        temperature: r.temperature,
        remainingTime: r.remaining_time,
        status: r.status,
        recordedAt: r.recorded_at
      })) || [],
      analytics,
      nextSteps: (readingCount || 0) === 0 ? [
        'Call POST /api/readings/collect to start collecting readings',
        'Visit /dashboard to trigger reading collection',
        'Readings will be automatically saved for analytics'
      ] : [
        'Readings are being collected successfully',
        'Use GET /api/devices/[deviceId]/readings for historical data',
        'Analytics are available for dashboard charts'
      ],
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Reading persistence test error:', error)
    return NextResponse.json({
      error: 'Failed to test reading persistence',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}