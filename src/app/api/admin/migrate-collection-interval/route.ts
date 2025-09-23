import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';

export async function POST() {
  try {
    // Add collection_interval_minutes column to data_retention_settings table
    await executeQuery(`
      ALTER TABLE data_retention_settings 
      ADD COLUMN IF NOT EXISTS collection_interval_minutes INTEGER DEFAULT 5
    `);

    // Create index for collection interval queries
    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_data_retention_collection_interval 
      ON data_retention_settings(collection_interval_minutes)
    `);

    return NextResponse.json({
      success: true,
      message: 'Collection interval column added to data retention settings table'
    });

  } catch (error) {
    console.error('Collection interval migration error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to add collection interval column',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}