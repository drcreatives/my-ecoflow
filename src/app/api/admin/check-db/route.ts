import { NextResponse } from 'next/server'
import { executeQuery } from '@/lib/database'

export async function GET() {
  try {
    // List all tables in the database
    const tables = await executeQuery<{ table_name: string }>(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       ORDER BY table_name`,
      []
    )

    // Check if users table has id column
    const userColumns = await executeQuery<{ column_name: string, data_type: string }>(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'users' 
       ORDER BY ordinal_position`,
      []
    )

    return NextResponse.json({ 
      tables: tables.map(t => t.table_name),
      userColumns: userColumns,
      message: 'Database structure retrieved successfully' 
    })
  } catch (error) {
    console.error('Error checking database structure:', error)
    return NextResponse.json(
      { error: 'Failed to check database structure', details: error }, 
      { status: 500 }
    )
  }
}