import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    console.log('🔄 Testing user creation and database operations...')
    
    // Test 1: Check current auth status
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'No authenticated user found',
        message: 'Please login first to test user creation'
      }, { status: 401 })
    }

    console.log('✅ Current user from Supabase Auth:', user.id, user.email)

    // Test 2: Check if user exists in our database
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id }
    })

    console.log('🔍 User in database:', existingUser ? 'EXISTS' : 'MISSING')

    // Test 3: Get all users count
    const totalUsers = await prisma.user.count()
    console.log('📊 Total users in database:', totalUsers)

    // Test 4: List all users (first 5)
    const allUsers = await prisma.user.findMany({
      take: 5,
      select: {
        id: true,
        email: true,
        createdAt: true
      }
    })

    // Test 5: If user doesn't exist, try to create them
    let creationResult = null
    if (!existingUser) {
      try {
        const newUser = await prisma.user.create({
          data: {
            id: user.id,
            email: user.email || 'unknown@example.com',
            passwordHash: 'managed-by-supabase',
          }
        })
        creationResult = 'SUCCESS'
        console.log('✅ Created missing user:', newUser.id)
      } catch (createError) {
        creationResult = `ERROR: ${createError instanceof Error ? createError.message : 'Unknown error'}`
        console.error('❌ Failed to create user:', createError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'User database test completed',
      tests: {
        authentication: 'PASS',
        userInDatabase: existingUser ? 'EXISTS' : 'MISSING',
        totalUsers: totalUsers,
        creationAttempt: creationResult
      },
      currentUser: {
        id: user.id,
        email: user.email,
        existsInDatabase: !!existingUser
      },
      allUsers: allUsers,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ User test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'User database test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorType: error?.constructor?.name || 'Unknown'
    }, { status: 500 })
  }
}