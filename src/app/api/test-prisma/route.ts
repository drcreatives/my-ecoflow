import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    console.log('🔄 Testing Prisma database connection...')
    
    // Test connection
    await prisma.$connect()
    console.log('✅ Prisma connected successfully')
    
    // Test basic query
    const userCount = await prisma.user.count()
    console.log('✅ User count query successful:', userCount)
    
    // Test if we can create a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Raw query test successful:', result)
    
    await prisma.$disconnect()
    console.log('✅ Prisma disconnected successfully')
    
    return NextResponse.json({
      success: true,
      message: 'Prisma database connection working!',
      tests: {
        connection: 'PASS',
        userCount: userCount,
        rawQuery: result,
        disconnect: 'PASS'
      },
      database: {
        host: process.env.POSTGRES_HOST || 'unknown',
        user: process.env.POSTGRES_USER || 'unknown'
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Prisma test failed:', error)
    
    try {
      await prisma.$disconnect()
    } catch (disconnectError) {
      console.error('❌ Failed to disconnect:', disconnectError)
    }
    
    return NextResponse.json({
      success: false,
      error: 'Prisma connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorType: error?.constructor?.name || 'Unknown'
    }, { status: 500 })
  }
}