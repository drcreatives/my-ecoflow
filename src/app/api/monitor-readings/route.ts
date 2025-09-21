import { NextResponse } from 'next/server'
import { withPrisma } from '@/lib/prisma'

export async function GET() {
  try {
    const result = await withPrisma(async (prisma) => {
      // Get recent readings
    const recentReadings = await prisma.deviceReading.findMany({
      take: 10,
      orderBy: {
        recordedAt: 'desc'
      },
      include: {
        device: {
          select: {
            deviceSn: true,
            deviceName: true
          }
        }
      }
    })

    // Get reading counts by device
    const readingStats = await prisma.deviceReading.groupBy({
      by: ['deviceId'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    })

    // Get device names for stats
    const devices = await prisma.device.findMany({
      select: {
        id: true,
        deviceSn: true,
        deviceName: true
      }
    })

    const statsWithNames = readingStats.map(stat => {
      const device = devices.find(d => d.id === stat.deviceId)
      return {
        deviceId: stat.deviceId,
        deviceName: device?.deviceName || 'Unknown Device',
        deviceSn: device?.deviceSn || 'Unknown SN',
        readingCount: stat._count.id
      }
    })

    return {
      status: 'success',
      message: 'Successfully monitoring readings',
      timestamp: new Date().toISOString(),
      readings: recentReadings.map(reading => ({
        id: reading.id,
        deviceId: reading.deviceId,
        deviceName: reading.device?.deviceName || 'Unknown',
        deviceSn: reading.device?.deviceSn || 'Unknown',
        batteryLevel: reading.batteryLevel,
        inputWatts: reading.inputWatts,
        outputWatts: reading.outputWatts,
        recordedAt: reading.recordedAt
      })),
      deviceStats: statsWithNames
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