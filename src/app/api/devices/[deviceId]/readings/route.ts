import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    // Verify authentication
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { deviceId } = await params

    // Verify device ownership
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id')
      .eq('id', deviceId)
      .eq('user_id', user.id)
      .single()

    if (deviceError || !device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const timeRange = searchParams.get('timeRange') || '24h'

    // Calculate time range
    const now = new Date()
    const timeRangeMap = {
      '1h': new Date(now.getTime() - 1 * 60 * 60 * 1000),
      '6h': new Date(now.getTime() - 6 * 60 * 60 * 1000),
      '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    }

    const startTime = timeRangeMap[timeRange as keyof typeof timeRangeMap] || timeRangeMap['24h']

    // Fetch readings from database
    const { data: readings, error: readingsError, count } = await supabase
      .from('device_readings')
      .select('*', { count: 'exact' })
      .eq('device_id', deviceId)
      .gte('recorded_at', startTime.toISOString())
      .order('recorded_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (readingsError) {
      console.error('Database error:', readingsError)
      return NextResponse.json(
        { error: 'Failed to fetch readings' },
        { status: 500 }
      )
    }

    // Transform readings to match frontend expectations
    const transformedReadings = (readings || []).map(reading => ({
      id: reading.id,
      deviceId: reading.device_id,
      batteryLevel: reading.battery_level,
      inputWatts: reading.input_watts,
      outputWatts: reading.output_watts,
      remainingTime: reading.remaining_time,
      temperature: reading.temperature,
      status: reading.status,
      rawData: reading.raw_data,
      recordedAt: reading.recorded_at,
    }))

    return NextResponse.json({
      readings: transformedReadings,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      },
      timeRange: {
        start: startTime.toISOString(),
        end: now.toISOString(),
        range: timeRange
      }
    })

  } catch (error) {
    console.error('Device readings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}