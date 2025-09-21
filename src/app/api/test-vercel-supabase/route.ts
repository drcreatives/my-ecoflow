import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    console.log('🔄 Testing Vercel Supabase connection...')
    
    // Test 1: Basic Supabase client creation
    const supabase = createClient()
    console.log('✅ Supabase client created successfully')
    
    // Test 2: Server-side client
    const serverSupabase = await createServerSupabaseClient()
    console.log('✅ Server Supabase client created successfully')
    
    // Test 3: Test authentication endpoint
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser()
    console.log('✅ Auth test completed (no active session expected)')
    
    // Test 4: Test database connection via Prisma
    await prisma.$connect()
    const userCount = await prisma.user.count()
    await prisma.$disconnect()
    console.log('✅ Database connection via Prisma successful')
    
    console.log('✅ All Vercel Supabase tests passed!')
    
    return NextResponse.json({
      success: true,
      message: 'Vercel Supabase connection working perfectly!',
      tests: {
        clientCreation: 'PASS',
        serverClientCreation: 'PASS', 
        authEndpoint: authError ? `ERROR: ${authError.message}` : 'PASS (no session)',
        databaseConnection: 'PASS',
        userCount: userCount
      },
      instance: {
        url: 'vunlsiyowwivmloivtjf.supabase.co',
        region: 'us-east-1'
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Test failed:', error)
    
    // More detailed error information
    let errorDetails = 'Unknown error'
    if (error instanceof Error) {
      errorDetails = error.message
    }
    
    return NextResponse.json({
      success: false,
      error: 'Connection test failed',
      details: errorDetails,
      instance: 'Vercel Supabase',
      errorType: error?.constructor?.name || 'Unknown'
    }, { status: 500 })
  }
}