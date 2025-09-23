import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';

export async function GET() {
  try {
    // Get notification_settings table structure
    const columns = await executeQuery(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'notification_settings'
      ORDER BY ordinal_position
    `);

    // Get sample data if any exists
    const sampleData = await executeQuery(`
      SELECT * FROM notification_settings LIMIT 5
    `);

    return NextResponse.json({
      tableName: 'notification_settings',
      columns,
      sampleData,
      message: 'Notification settings table structure'
    });

  } catch (error) {
    console.error('Database check error:', error);
    return NextResponse.json(
      { 
        error: 'Database check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}