import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';
import { createServerSupabaseClient } from '@/lib/supabase-server';

interface DeviceReading {
  id: string;
  deviceId: string;
  batteryLevel: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  temperature: number | null;
  status: string;
  recordedAt: string;
  deviceName?: string;
  deviceSn?: string;
  userId?: string;
  // AC/DC/USB power breakdown fields
  acOutputWatts?: number | null;
  dcOutputWatts?: number | null;
  usbOutputWatts?: number | null;
  // Raw data for extraction
  rawData?: any;
}

interface HistorySummary {
  totalReadings: number
  avgBatteryLevel: number
  avgPowerOutput: number
  avgTemperature: number
  peakPowerOutput: number
  lowestBatteryLevel: number
  highestTemperature: number
  timeSpan: string
  startTime: string
  endTime: string
}

interface HistoryQueryParams {
  deviceId?: string
  startDate?: string
  endDate?: string
  timeRange?: string
  aggregation?: string
  limit?: string
  offset?: string
}

/**
 * GET /api/history/readings
 * Fetch historical device readings with filtering and aggregation
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication using the same pattern as working endpoints
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = user.id
    const searchParams = request.nextUrl.searchParams
    
    // Parse query parameters
    const params: HistoryQueryParams = {
      deviceId: searchParams.get('deviceId') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      timeRange: (searchParams.get('timeRange') as any) || '24h',
      aggregation: (searchParams.get('aggregation') as any) || 'raw',
      limit: searchParams.get('limit') || '1000',
      offset: searchParams.get('offset') || '0'
    }

    // Calculate time range if not provided
    let startTime: Date
    let endTime: Date = new Date()

    if (params.startDate && params.endDate) {
      startTime = new Date(params.startDate)
      endTime = new Date(params.endDate)
    } else {
      // Use timeRange parameter
      const now = new Date()
      switch (params.timeRange) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000)
          break
        case '6h':
          startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000)
          break
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case '30d':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      }
      endTime = now
    }

    // Build base query with user's devices only
    let baseQuery = `
      SELECT 
        dr.id,
        dr.device_id as "deviceId",
        dr.battery_level as "batteryLevel",
        dr.input_watts as "inputWatts",
        dr.output_watts as "outputWatts",
        dr.ac_output_watts as "acOutputWatts",
        dr.dc_output_watts as "dcOutputWatts",
        dr.usb_output_watts as "usbOutputWatts",
        dr.temperature,
        dr.remaining_time as "remainingTime",
        dr.status,
        dr.raw_data as "rawData",
        dr.recorded_at as "recordedAt",
        d.device_name as "deviceName",
        d.device_sn as "deviceSn"
      FROM device_readings dr
      JOIN devices d ON dr.device_id = d.id
      WHERE d.user_id = $1
        AND dr.recorded_at >= $2
        AND dr.recorded_at <= $3
    `

    let queryParams: any[] = [userId, startTime.toISOString(), endTime.toISOString()]
    let paramIndex = 4

    // Add device filter if specified
    if (params.deviceId && params.deviceId !== 'all') {
      baseQuery += ` AND dr.device_id = $${paramIndex}`
      queryParams.push(params.deviceId)
      paramIndex++
    }

    // Apply aggregation
    let aggregatedQuery = baseQuery
    if (params.aggregation && params.aggregation !== 'raw') {
      const truncInterval = params.aggregation === '5m' ? 'hour' :  // For 5min, truncate to hour then group by 5min intervals
                           params.aggregation === '1h' ? 'hour' :
                           params.aggregation === '1d' ? 'day' : 'hour'
      
      if (params.aggregation === '5m') {
        // For 5-minute intervals, group by 5-minute buckets within each hour
        aggregatedQuery = `
          SELECT 
            MIN(dr.id) as id,
            dr.device_id as "deviceId",
            AVG(dr.battery_level) as "batteryLevel",
            AVG(dr.input_watts) as "inputWatts",
            AVG(dr.output_watts) as "outputWatts",
            AVG(dr.ac_output_watts) as "acOutputWatts",
            AVG(dr.dc_output_watts) as "dcOutputWatts",
            AVG(dr.usb_output_watts) as "usbOutputWatts",
            AVG(dr.temperature) as "temperature",
            AVG(dr.remaining_time) as "remainingTime",
            MODE() WITHIN GROUP (ORDER BY dr.status) as status,
            date_trunc('hour', dr.recorded_at) + 
            INTERVAL '5 minutes' * FLOOR(EXTRACT(minute FROM dr.recorded_at) / 5) as "recordedAt"
          FROM device_readings dr
          JOIN devices d ON dr.device_id = d.id
          WHERE d.user_id = $1
            AND dr.recorded_at >= $2
            AND dr.recorded_at <= $3
          ${params.deviceId && params.deviceId !== 'all' ? `AND dr.device_id = $${queryParams.length}` : ''}
          GROUP BY dr.device_id, date_trunc('hour', dr.recorded_at) + 
                   INTERVAL '5 minutes' * FLOOR(EXTRACT(minute FROM dr.recorded_at) / 5)
        `
      } else {
        // For hourly and daily intervals, use simple date_trunc
        aggregatedQuery = `
          SELECT 
            MIN(dr.id) as id,
            dr.device_id as "deviceId",
            AVG(dr.battery_level) as "batteryLevel",
            AVG(dr.input_watts) as "inputWatts",
            AVG(dr.output_watts) as "outputWatts",
            AVG(dr.ac_output_watts) as "acOutputWatts",
            AVG(dr.dc_output_watts) as "dcOutputWatts",
            AVG(dr.usb_output_watts) as "usbOutputWatts",
            AVG(dr.temperature) as "temperature",
            AVG(dr.remaining_time) as "remainingTime",
            MODE() WITHIN GROUP (ORDER BY dr.status) as status,
            date_trunc('${truncInterval}', dr.recorded_at) as "recordedAt"
          FROM device_readings dr
          JOIN devices d ON dr.device_id = d.id
          WHERE d.user_id = $1
            AND dr.recorded_at >= $2
            AND dr.recorded_at <= $3
          ${params.deviceId && params.deviceId !== 'all' ? `AND dr.device_id = $${queryParams.length}` : ''}
          GROUP BY dr.device_id, date_trunc('${truncInterval}', dr.recorded_at)
        `
      }
    }

    // Add ordering and limits
    aggregatedQuery += ` ORDER BY "recordedAt" DESC`
    
    const limit = parseInt(params.limit || '1000')
    const offset = parseInt(params.offset || '0')
    
    if (limit > 0) {
      aggregatedQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
      queryParams.push(limit, offset)
    }

    // Execute main query
    const queryResult = await executeQuery<any>(aggregatedQuery, queryParams)
    let rawReadings: any[] = Array.isArray(queryResult) ? queryResult : []

    // Debug: Log query results
    console.log('History API Debug:', {
      userId,
      deviceId: params.deviceId,
      timeRange: params.timeRange,
      rawReadingsCount: rawReadings.length,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    })

    // Transform readings - use database column values for AC/DC/USB breakdown
    const readings: DeviceReading[] = rawReadings.map(reading => {
      return {
        id: reading.id,
        deviceId: reading.deviceId,
        batteryLevel: reading.batteryLevel ? Number(reading.batteryLevel) : null,
        inputWatts: reading.inputWatts ? Number(reading.inputWatts) : null,
        outputWatts: reading.outputWatts ? Number(reading.outputWatts) : null,
        acOutputWatts: reading.acOutputWatts ? Number(reading.acOutputWatts) : null,
        dcOutputWatts: reading.dcOutputWatts ? Number(reading.dcOutputWatts) : null,
        usbOutputWatts: reading.usbOutputWatts ? Number(reading.usbOutputWatts) : null,
        temperature: reading.temperature ? Number(reading.temperature) : null,
        remainingTime: reading.remainingTime,
        status: reading.status,
        recordedAt: reading.recordedAt,
        deviceName: reading.deviceName,
        deviceSn: reading.deviceSn
      }
    })

    // Calculate summary statistics
    let summary: HistorySummary | null = null
    if (readings && readings.length > 0) {
      const batteryLevels: number[] = readings
        .map((r: DeviceReading) => r.batteryLevel)
        .filter((level): level is number => level !== null && level !== undefined)
      
      const powerOutputs: number[] = readings
        .map((r: DeviceReading) => r.outputWatts)
        .filter((watts): watts is number => watts !== null && watts !== undefined)
      
      const temperatures: number[] = readings
        .map((r: DeviceReading) => r.temperature)
        .filter((temp): temp is number => temp !== null && temp !== undefined)

      const timeDiff = endTime.getTime() - startTime.getTime()
      const hoursDiff = Math.round(timeDiff / (1000 * 60 * 60))

      summary = {
        totalReadings: readings.length,
        avgBatteryLevel: batteryLevels.length > 0 ? batteryLevels.reduce((a, b) => a + b, 0) / batteryLevels.length : 0,
        avgPowerOutput: powerOutputs.length > 0 ? powerOutputs.reduce((a, b) => a + b, 0) / powerOutputs.length : 0,
        avgTemperature: temperatures.length > 0 ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : 0,
        peakPowerOutput: powerOutputs.length > 0 ? Math.max(...powerOutputs) : 0,
        lowestBatteryLevel: batteryLevels.length > 0 ? Math.min(...batteryLevels) : 0,
        highestTemperature: temperatures.length > 0 ? Math.max(...temperatures) : 0,
        timeSpan: hoursDiff >= 24 ? `${Math.round(hoursDiff / 24)} days` : `${hoursDiff} hours`,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }
    }

    // Get device information for context
    let deviceInfo = null
    if (params.deviceId && params.deviceId !== 'all') {
      const deviceQuery = `
        SELECT id, device_sn as "deviceSn", device_name as "deviceName"
        FROM devices 
        WHERE id = $1 AND user_id = $2
      `
      const deviceResult = await executeQuery(deviceQuery, [params.deviceId, userId])
      deviceInfo = deviceResult?.[0] || null
    }

    return NextResponse.json({
      success: true,
      data: {
        readings: readings || [],
        summary,
        device: deviceInfo,
        filters: {
          deviceId: params.deviceId,
          timeRange: params.timeRange,
          aggregation: params.aggregation,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          limit: limit,
          offset: offset
        },
        pagination: {
          hasMore: readings && readings.length >= limit,
          nextOffset: offset + limit,
          total: readings?.length || 0
        }
      }
    })

  } catch (error) {
    console.error('History API error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch historical data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/history/readings
 * Export historical data in various formats
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { format = 'csv', filters = {} } = body

    // Use the same logic as GET to fetch data
    const getRequest = new Request(request.url + '?' + new URLSearchParams({
      deviceId: filters.deviceId || 'all',
      timeRange: filters.timeRange || '24h',
      aggregation: filters.aggregation || 'raw',
      limit: '10000' // Higher limit for exports
    }))
    getRequest.headers.set('authorization', request.headers.get('authorization') || '')

    const response = await GET(getRequest as any)
    const data = await response.json()

    if (!data.success) {
      return NextResponse.json(data, { status: response.status })
    }

    const readings = data.data.readings

    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = [
        'Timestamp',
        'Device ID', 
        'Battery Level (%)',
        'Input Power (W)',
        'Output Power (W)',
        'Temperature (°C)',
        'Remaining Time (min)',
        'Status'
      ]

      const csvRows = readings.map((reading: any) => [
        new Date(reading.recordedAt).toISOString(),
        reading.deviceId,
        reading.batteryLevel?.toString() || '',
        reading.inputWatts?.toString() || '',
        reading.outputWatts?.toString() || '',
        reading.temperature?.toString() || '',
        reading.remainingTime?.toString() || '',
        reading.status || ''
      ])

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map((cell: any) => `"${cell}"`).join(','))
        .join('\n')

      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="ecoflow-history-${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    } else if (format === 'json') {
      // Return JSON with metadata
      return NextResponse.json({
        success: true,
        exportData: {
          readings,
          summary: data.data.summary,
          device: data.data.device,
          filters: data.data.filters,
          exportedAt: new Date().toISOString(),
          format: 'json'
        }
      })
    } else {
      return NextResponse.json(
        { error: 'Unsupported export format. Use "csv" or "json"' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('History export error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to export historical data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}