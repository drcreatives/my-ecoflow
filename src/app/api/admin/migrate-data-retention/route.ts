import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';

export async function POST() {
  try {
    // Create data_retention_settings table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS data_retention_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL UNIQUE,
        retention_period_days INTEGER NOT NULL DEFAULT 90,
        auto_cleanup_enabled BOOLEAN DEFAULT true,
        backup_enabled BOOLEAN DEFAULT true,
        last_cleanup TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for faster queries
    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_data_retention_user_id 
      ON data_retention_settings(user_id)
    `);

    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_data_retention_auto_cleanup 
      ON data_retention_settings(auto_cleanup_enabled)
    `);

    return NextResponse.json({
      success: true,
      message: 'Data retention settings table created successfully'
    });

  } catch (error) {
    console.error('Data retention migration error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create data retention settings table',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}