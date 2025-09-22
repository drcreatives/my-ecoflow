import { NextRequest, NextResponse } from 'next/server'
import { executeQuery } from '@/lib/database'

/**
 * GET /api/test-db-direct
 * Direct database test to see what's in device_readings table
 */
export async function GET(request: NextRequest) {
  try {
    // Get total count of readings
    const countQuery = `SELECT COUNT(*) as total FROM device_readings`
    const countResult = await executeQuery(countQuery, [])
    const totalReadings = countResult?.[0]?.total || 0

    // Get recent readings with device info
    const recentQuery = `
      SELECT 
        dr.id,
        dr.device_id as "deviceId",
        dr.battery_level as "batteryLevel",
        dr.input_watts as "inputWatts", 
        dr.output_watts as "outputWatts",
        dr.temperature,
        dr.status,
        dr.raw_data as "rawData",
        dr.recorded_at as "recordedAt",
        d.device_name as "deviceName",
        d.device_sn as "deviceSn",
        d.user_id as "userId"
      FROM device_readings dr
      LEFT JOIN devices d ON dr.device_id = d.id
      ORDER BY dr.recorded_at DESC
      LIMIT 10
    `
    const recentReadings = await executeQuery(recentQuery, [])

    // Get all users for context
    const usersQuery = `SELECT id, email FROM users`
    const users = await executeQuery(usersQuery, [])

    return NextResponse.json({
      success: true,
      data: {
        totalReadings,
        recentReadings: recentReadings || [],
        users: users || [],
        debug: {
          countQueryResult: countResult,
          timestamp: new Date().toISOString()
        }
      }
    })

  } catch (error) {
    console.error('Direct DB test error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Database query failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}