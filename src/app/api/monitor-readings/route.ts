import { NextResponse } from 'next/server'
import { executeQuery } from '@/lib/database'

export async function GET() {
  try {
    // Use direct PostgreSQL connection to completely bypass Prisma
    const recentReadings = await executeQuery<{
      id: string
      deviceId: string
      batteryLevel: number
      inputWatts: number
      outputWatts: number
      acOutputWatts: number
      dcOutputWatts: number
      usbOutputWatts: number
      recordedAt: Date
      deviceSn: string | null
      deviceName: string | null
    }>(`
      SELECT 
        dr.id,
        dr.device_id as "deviceId",
        dr.battery_level as "batteryLevel",
        dr.input_watts as "inputWatts", 
        dr.output_watts as "outputWatts",
        COALESCE(dr.ac_output_watts, 0) as "acOutputWatts",
        COALESCE(dr.dc_output_watts, 0) as "dcOutputWatts",
        COALESCE(dr.usb_output_watts, 0) as "usbOutputWatts",
        dr.recorded_at as "recordedAt",
        d.device_sn as "deviceSn",
        d.device_name as "deviceName"
      FROM device_readings dr
      LEFT JOIN devices d ON dr.device_id = d.id
      ORDER BY dr.recorded_at DESC
      LIMIT 10
    `)

    // Get reading counts by device using direct SQL
    const readingStats = await executeQuery<{
      deviceId: string
      deviceSn: string | null
      deviceName: string | null
      readingCount: number
    }>(`
      SELECT 
        dr.device_id as "deviceId",
        d.device_sn as "deviceSn",
        d.device_name as "deviceName",
        COUNT(dr.id)::int as "readingCount"
      FROM device_readings dr
      LEFT JOIN devices d ON dr.device_id = d.id
      GROUP BY dr.device_id, d.device_sn, d.device_name
      ORDER BY COUNT(dr.id) DESC
    `)

    const result = {
      status: 'success',
      message: 'Successfully monitoring readings',
      timestamp: new Date().toISOString(),
      readings: recentReadings.map(reading => ({
        id: reading.id,
        deviceId: reading.deviceId,
        deviceName: reading.deviceName || 'Unknown',
        deviceSn: reading.deviceSn || 'Unknown',
        batteryLevel: reading.batteryLevel,
        inputWatts: reading.inputWatts,
        outputWatts: reading.outputWatts,
        acOutputWatts: reading.acOutputWatts,
        dcOutputWatts: reading.dcOutputWatts,
        usbOutputWatts: reading.usbOutputWatts,
        recordedAt: reading.recordedAt
      })),
      deviceStats: readingStats.map(stat => ({
        deviceId: stat.deviceId,
        deviceName: stat.deviceName || 'Unknown Device',
        deviceSn: stat.deviceSn || 'Unknown SN',
        readingCount: stat.readingCount
      }))
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error monitoring readings:', error)
    
    return NextResponse.json({
      status: 'error',
      message: 'Failed to monitor readings',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}