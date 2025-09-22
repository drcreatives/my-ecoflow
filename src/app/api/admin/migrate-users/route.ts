import { NextResponse } from 'next/server'
import { executeQuery } from '@/lib/database'

export async function POST() {
  try {
    // Add firstName and lastName columns to users table
    await executeQuery(
      `ALTER TABLE users 
       ADD COLUMN IF NOT EXISTS first_name VARCHAR(50),
       ADD COLUMN IF NOT EXISTS last_name VARCHAR(50)`,
      []
    )

    return NextResponse.json({ 
      message: 'Successfully added firstName and lastName columns to users table' 
    })
  } catch (error) {
    console.error('Error adding columns:', error)
    return NextResponse.json(
      { error: 'Failed to add columns to users table' }, 
      { status: 500 }
    )
  }
}