import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceSn, userId } = body

    if (!deviceSn || !userId) {
      return NextResponse.json(
        { error: 'Device serial number and userId are required' },
        { status: 400 }
      )
    }

    // Find and delete the device registration
    const deletedDevice = await prisma.device.deleteMany({
      where: {
        deviceSn: deviceSn,
        userId: userId
      }
    })

    if (deletedDevice.count === 0) {
      return NextResponse.json(
        { error: 'Device not found or not registered to this user' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Device unregistered successfully',
      deletedCount: deletedDevice.count
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}