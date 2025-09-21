import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, email } = body

    if (!userId || !email) {
      return NextResponse.json({
        error: 'userId and email are required'
      }, { status: 400 })
    }

    console.log('🔄 Attempting to create user manually:', userId, email)

    // Try to create the user
    const newUser = await prisma.user.create({
      data: {
        id: userId,
        email: email,
        passwordHash: 'test-password-hash',
      }
    })

    console.log('✅ User created successfully:', newUser)

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      user: newUser
    })

  } catch (error) {
    console.error('❌ Manual user creation failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'User creation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorType: error?.constructor?.name || 'Unknown'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // List all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        createdAt: true
      }
    })

    const count = await prisma.user.count()

    return NextResponse.json({
      success: true,
      message: 'Users retrieved successfully',
      users: users,
      count: count
    })

  } catch (error) {
    console.error('❌ Failed to retrieve users:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve users',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}