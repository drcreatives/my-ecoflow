import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated',
        details: authError?.message || 'No user session'
      }, { status: 401 })
    }

    // Check if user exists in our database
    await prisma.$connect()
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id }
    })
    await prisma.$disconnect()

    return NextResponse.json({
      success: true,
      message: 'Authentication check successful',
      auth: {
        supabaseUser: {
          id: user.id,
          email: user.email,
          created_at: user.created_at
        },
        databaseUser: dbUser ? {
          id: dbUser.id,
          email: dbUser.email,
          createdAt: dbUser.createdAt
        } : null,
        userExistsInDatabase: !!dbUser
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Auth test failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Authentication test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}