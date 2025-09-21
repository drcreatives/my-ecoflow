import { NextResponse } from 'next/server'
import { getPrismaClient, disconnectPrisma } from '@/lib/prisma'

export async function GET() {
  const prisma = getPrismaClient()
  
  try {
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
        deviceSn: device?.deviceSn || 'Unknown',
        deviceName: device?.deviceName || 'Unknown',
        readingCount: stat._count.id
      }
    })

    return NextResponse.json({
      status: 'success',
      message: 'Reading persistence monitoring',
      timestamp: new Date().toISOString(),
      summary: {
        totalReadings: await prisma.deviceReading.count(),
        totalDevices: devices.length,
        recentReadings: recentReadings.length
      },
      recentReadings: recentReadings.map(reading => ({
        id: reading.id,
        deviceSn: reading.device.deviceSn,
        deviceName: reading.device.deviceName,
        batteryLevel: reading.batteryLevel,
        outputWatts: reading.outputWatts,
        status: reading.status,
        recordedAt: reading.recordedAt
      })),
      deviceStats: statsWithNames
    })

  } catch (error) {
    console.error('Error monitoring readings:', error)
    
    return NextResponse.json({
      status: 'error',
      message: 'Failed to monitor readings',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    // Always disconnect in serverless
    await disconnectPrisma(prisma)
  }
}