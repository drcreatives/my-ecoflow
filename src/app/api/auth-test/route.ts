import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    // Test Supabase authentication
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log('Auth test - User:', user?.id, 'Error:', authError?.message)

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        message: 'No authenticated user found',
        authStatus: 'unauthenticated',
        error: authError?.message,
        nextSteps: [
          'User needs to sign up/login through Supabase Auth',
          'You can create a test user in Supabase dashboard',
          'Or implement a signup/login flow'
        ]
      }, { status: 401 })
    }

    // If user is authenticated, test database operations
    await prisma.$connect()

    // Check if user exists in our database
    const dbUser = await prisma.user.findUnique({
      where: { email: user.email || '' }
    })

    // Test basic database queries
    const userCount = await prisma.user.count()
    const deviceCount = await prisma.device.count()

    return NextResponse.json({
      success: true,
      message: 'Authentication and database test successful',
      authStatus: 'authenticated',
      user: {
        id: user.id,
        email: user.email,
        existsInDb: !!dbUser
      },
      databaseStats: {
        userCount,
        deviceCount,
        tablesAccessible: true
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Auth/DB test failed:', error)
    
    return NextResponse.json(
      { 
        error: 'Authentication or database test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'create-test-user') {
      // Create a test user in our database (not in Supabase Auth)
      await prisma.$connect()
      
      const testUser = await prisma.user.create({
        data: {
          id: 'test-user-' + Date.now(),
          email: 'test@example.com',
          passwordHash: 'test-hash-not-real'
        }
      })

      return NextResponse.json({
        success: true,
        message: 'Test user created in database',
        user: testUser
      })
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    )

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create test user', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}