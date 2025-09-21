import { NextResponse } from 'next/server'
import { withPrisma } from '@/lib/prisma'

export async function GET() {
  try {
    const result = await withPrisma(async (prisma) => {
      // Use raw SQL to bypass prepared statement conflicts
      const recentReadings = await prisma.$queryRaw<Array<{
        id: string
        deviceId: string
        batteryLevel: number
        inputWatts: number
        outputWatts: number
        recordedAt: Date
        deviceSn: string | null
        deviceName: string | null
      }>>`
        SELECT 
          dr.id,
          dr."deviceId",
          dr."batteryLevel",
          dr."inputWatts", 
          dr."outputWatts",
          dr."recordedAt",
          d."deviceSn",
          d."deviceName"
        FROM "DeviceReading" dr
        LEFT JOIN "Device" d ON dr."deviceId" = d.id
        ORDER BY dr."recordedAt" DESC
        LIMIT 10
      `

      // Get reading counts by device using raw SQL
      const readingStats = await prisma.$queryRaw<Array<{
        deviceId: string
        deviceSn: string | null
        deviceName: string | null
        readingCount: number
      }>>`
        SELECT 
          dr."deviceId",
          d."deviceSn",
          d."deviceName",
          COUNT(dr.id)::int as "readingCount"
        FROM "DeviceReading" dr
        LEFT JOIN "Device" d ON dr."deviceId" = d.id
        GROUP BY dr."deviceId", d."deviceSn", d."deviceName"
        ORDER BY COUNT(dr.id) DESC
      `

      return {
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
          recordedAt: reading.recordedAt
        })),
        deviceStats: readingStats.map(stat => ({
          deviceId: stat.deviceId,
          deviceName: stat.deviceName || 'Unknown Device',
          deviceSn: stat.deviceSn || 'Unknown SN',
          readingCount: stat.readingCount
        }))
      }
    })

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