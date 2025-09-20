import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    // Test basic database connection
    console.log('Testing database connection...')
    
    // Try to connect and run a simple query
    await prisma.$connect()
    console.log('✅ Database connection successful')
    
    // Test a simple query to verify the connection works
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Database query successful:', result)
    
    // Check if our tables exist (they might not be created yet)
    let tableInfo = null
    try {
      const tables = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `
      tableInfo = tables
      console.log('📋 Existing tables:', tables)
    } catch (tableError) {
      console.log('ℹ️ Could not fetch table info (this is normal if no migrations have been run)')
    }
    
    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      connectionTest: result,
      tables: tableInfo,
      timestamp: new Date().toISOString(),
      nextSteps: [
        'Database connection is working',
        'Next: Run Prisma migrations to create tables',
        'Then: Set up Supabase authentication'
      ]
    })

  } catch (error) {
    console.error('Database connection failed:', error)
    
    return NextResponse.json(
      { 
        error: 'Database connection failed',
        message: error instanceof Error ? error.message : 'Unknown database error',
        troubleshooting: [
          'Check that DATABASE_URL is correct',
          'Verify Supabase project is running',
          'Ensure database password is correct',
          'Check network connectivity'
        ]
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}