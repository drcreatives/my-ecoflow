import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { executeQuery } from '@/lib/database'

interface UserProfile {
  id: string
  email: string
  firstName?: string
  lastName?: string
  createdAt: string
}

interface Device {
  id: string
  deviceSn: string
  deviceName: string
  deviceType: string
  isActive: boolean
  createdAt: string
}

interface Reading {
  id: string
  deviceId: string
  batteryLevel: number
  inputWatts: number
  outputWatts: number
  acOutputWatts: number
  dcOutputWatts: number
  usbOutputWatts: number
  temperature: number
  status: string
  recordedAt: string
}

interface Statistics {
  total_devices: string
  total_readings: string
  earliest_reading: string
  latest_reading: string
  avg_battery: string
  avg_input: string
  avg_output: string
  avg_temperature: string
}

interface ExportData {
  user: UserProfile
  devices: Device[]
  readings: Reading[]
  statistics: {
    totalDevices: number
    totalReadings: number
    dateRange: {
      earliest: string
      latest: string
    }
    averages: {
      batteryLevel: number
      inputWatts: number
      outputWatts: number
      temperature: number
    }
  }
  exportInfo: {
    exportedAt: string
    exportFormat: string
    version: string
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const format = url.searchParams.get('format') || 'json'
    const dateFrom = url.searchParams.get('from')
    const dateTo = url.searchParams.get('to')

    // Get user profile
    const userProfileResult = await executeQuery<UserProfile>(
      `SELECT 
        id, 
        email, 
        first_name as "firstName", 
        last_name as "lastName", 
        created_at as "createdAt"
      FROM users 
      WHERE id = $1`,
      [user.id]
    )

    if (userProfileResult.length === 0) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get user's devices
    const devices = await executeQuery<Device>(
      `SELECT 
        id,
        device_sn as "deviceSn",
        device_name as "deviceName",
        device_type as "deviceType",
        is_active as "isActive",
        created_at as "createdAt"
      FROM devices 
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [user.id]
    )

    // Get device readings with optional date filtering
    let readingsQuery = `
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
        dr.status,
        dr.recorded_at as "recordedAt"
      FROM device_readings dr
      JOIN devices d ON dr.device_id = d.id
      WHERE d.user_id = $1`
    
    const queryParams = [user.id]
    let paramIndex = 2

    if (dateFrom) {
      readingsQuery += ` AND dr.recorded_at >= $${paramIndex}`
      queryParams.push(dateFrom)
      paramIndex++
    }

    if (dateTo) {
      readingsQuery += ` AND dr.recorded_at <= $${paramIndex}`
      queryParams.push(dateTo)
      paramIndex++
    }

    readingsQuery += ` ORDER BY dr.recorded_at DESC LIMIT 10000` // Limit to prevent huge exports

    const readings = await executeQuery<Reading>(readingsQuery, queryParams)

    // Calculate statistics
    const statsResult = await executeQuery<Statistics>(
      `SELECT 
        COUNT(DISTINCT d.id) as total_devices,
        COUNT(dr.id) as total_readings,
        MIN(dr.recorded_at) as earliest_reading,
        MAX(dr.recorded_at) as latest_reading,
        AVG(dr.battery_level) as avg_battery,
        AVG(dr.input_watts) as avg_input,
        AVG(dr.output_watts) as avg_output,
        AVG(dr.temperature) as avg_temperature
      FROM devices d
      LEFT JOIN device_readings dr ON d.id = dr.device_id
      WHERE d.user_id = $1`,
      [user.id]
    )

    const statistics = statsResult[0] || {
      total_devices: '0',
      total_readings: '0',
      earliest_reading: '',
      latest_reading: '',
      avg_battery: '0',
      avg_input: '0',
      avg_output: '0',
      avg_temperature: '0'
    }

    // Prepare export data
    const exportData: ExportData = {
      user: userProfileResult[0],
      devices,
      readings,
      statistics: {
        totalDevices: parseInt(statistics.total_devices) || 0,
        totalReadings: parseInt(statistics.total_readings) || 0,
        dateRange: {
          earliest: statistics.earliest_reading || '',
          latest: statistics.latest_reading || ''
        },
        averages: {
          batteryLevel: parseFloat(statistics.avg_battery) || 0,
          inputWatts: parseFloat(statistics.avg_input) || 0,
          outputWatts: parseFloat(statistics.avg_output) || 0,
          temperature: parseFloat(statistics.avg_temperature) || 0
        }
      },
      exportInfo: {
        exportedAt: new Date().toISOString(),
        exportFormat: format,
        version: '1.0'
      }
    }

    // Return data based on format
    if (format === 'csv') {
      return generateCSVExport(exportData)
    } else {
      // JSON format (default)
      const fileName = `ecoflow-data-export-${new Date().toISOString().split('T')[0]}.json`
      
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'no-cache'
        }
      })
    }

  } catch (error) {
    console.error('Error exporting user data:', error)
    return NextResponse.json(
      { error: 'Failed to export user data' }, 
      { status: 500 }
    )
  }
}

function generateCSVExport(data: ExportData): NextResponse {
  try {
    // Create CSV content for readings (most useful format)
    const csvHeaders = [
      'Device Name',
      'Device SN', 
      'Battery Level (%)',
      'Input Watts',
      'Output Watts',
      'AC Output Watts',
      'DC Output Watts', 
      'USB Output Watts',
      'Temperature (°C)',
      'Status',
      'Recorded At'
    ].join(',')

    const csvRows = data.readings.map(reading => {
      const device = data.devices.find(d => d.id === reading.deviceId)
      return [
        device?.deviceName || 'Unknown',
        device?.deviceSn || '',
        reading.batteryLevel,
        reading.inputWatts,
        reading.outputWatts,
        reading.acOutputWatts,
        reading.dcOutputWatts,
        reading.usbOutputWatts,
        reading.temperature,
        reading.status,
        reading.recordedAt
      ].join(',')
    })

    const csvContent = [csvHeaders, ...csvRows].join('\n')
    const fileName = `ecoflow-readings-export-${new Date().toISOString().split('T')[0]}.csv`

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-cache'
      }
    })
  } catch (error) {
    console.error('Error generating CSV:', error)
    throw error
  }
}