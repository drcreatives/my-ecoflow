import { NextResponse } from 'next/server'
import { executeQuery } from '@/lib/database'

export async function GET() {
  try {
    console.log('🔄 Testing direct PostgreSQL connection without Prisma...')
    
    // Simple test query using only direct PostgreSQL
    const result = await executeQuery<{ test: number }>(`
      SELECT 1 as test
    `)
    
    return NextResponse.json({
      status: 'success',
      message: 'Direct PostgreSQL connection working',
      timestamp: new Date().toISOString(),
      result: result[0],
      note: 'This endpoint uses zero Prisma code - only direct pg library connection'
    })
    
  } catch (error) {
    console.error('❌ Direct PostgreSQL error:', error)
    
    return NextResponse.json({
      status: 'error',
      message: 'Direct PostgreSQL connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      note: 'This endpoint uses zero Prisma code - only direct pg library connection'
    }, { status: 500 })
  }
}