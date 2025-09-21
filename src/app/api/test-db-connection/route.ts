import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Test database connection
    const result = await prisma.$queryRaw`SELECT 1 as test`
    
    // Count existing readings
    const readingCount = await prisma.deviceReading.count()
    const deviceCount = await prisma.device.count()
    
    return NextResponse.json({
      status: 'success',
      message: 'Database connection successful',
      data: {
        testQuery: result,
        counts: {
          devices: deviceCount,
          readings: readingCount
        }
      }
    })
  } catch (error) {
    console.error('Database connection error:', error)
    return NextResponse.json({
      status: 'error',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}