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

    // Check if device already exists
    const existingDevice = await prisma.device.findFirst({
      where: {
        deviceSn: deviceSn,
        userId: userId
      }
    })

    if (existingDevice) {
      return NextResponse.json({
        success: true,
        device: existingDevice,
        message: 'Device already registered'
      })
    }

    // Register device in our database using Prisma
    const device = await prisma.device.create({
      data: {
        userId: userId,
        deviceSn: deviceSn,
        deviceName: 'DELTA 2',
        deviceType: 'DELTA_2',
        isActive: true,
      }
    })

    return NextResponse.json({
      success: true,
      device,
      message: 'Device registered successfully'
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}