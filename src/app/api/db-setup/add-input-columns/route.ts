import { NextResponse } from 'next/server'
import { executeQuery } from '@/lib/database'

/**
 * POST /api/db-setup/add-input-columns
 * Adds ac_input_watts, dc_input_watts, and charging_type columns to device_readings table
 * Safe to run multiple times (uses IF NOT EXISTS pattern)
 */
export async function POST() {
  try {
    console.log('🔧 Adding AC/DC input columns to device_readings...')

    // Add ac_input_watts column
    await executeQuery(`
      ALTER TABLE device_readings 
      ADD COLUMN IF NOT EXISTS ac_input_watts DECIMAL(10,2) DEFAULT 0
    `)
    console.log('✅ ac_input_watts column added/exists')

    // Add dc_input_watts column
    await executeQuery(`
      ALTER TABLE device_readings 
      ADD COLUMN IF NOT EXISTS dc_input_watts DECIMAL(10,2) DEFAULT 0
    `)
    console.log('✅ dc_input_watts column added/exists')

    // Add charging_type column
    await executeQuery(`
      ALTER TABLE device_readings 
      ADD COLUMN IF NOT EXISTS charging_type INTEGER DEFAULT NULL
    `)
    console.log('✅ charging_type column added/exists')

    // Backfill ALL records: extract AC/DC input and fix total input_watts from raw_data
    // Step 1: Backfill ac_input_watts, dc_input_watts, charging_type from raw_data
    const breakdownResult = await executeQuery<{ updated: number }>(`
      WITH updated AS (
        UPDATE device_readings 
        SET 
          ac_input_watts = COALESCE(
            (raw_data->'quotaMap'->'inv.inputWatts'->>'val')::decimal,
            0
          ),
          dc_input_watts = COALESCE(
            (raw_data->'quotaMap'->'mppt.inWatts'->>'val')::decimal,
            0
          ),
          charging_type = (raw_data->'quotaMap'->'mppt.chgType'->>'val')::integer
        WHERE raw_data IS NOT NULL 
          AND raw_data::text != '{}'
          AND raw_data::text != 'null'
          AND raw_data->'quotaMap' IS NOT NULL
        RETURNING 1
      )
      SELECT count(*)::integer as updated FROM updated
    `)

    const breakdownCount = breakdownResult[0]?.updated || 0
    console.log(`✅ Backfilled AC/DC breakdown for ${breakdownCount} records`)

    // Step 2: CRITICAL — Fix the total input_watts column from pd.wattsInSum
    // The old code only stored inv.inputWatts (AC) as input_watts, so DC charging showed 0
    const totalInputResult = await executeQuery<{ updated: number }>(`
      WITH updated AS (
        UPDATE device_readings 
        SET 
          input_watts = GREATEST(
            COALESCE((raw_data->'quotaMap'->'pd.wattsInSum'->>'val')::decimal, 0),
            COALESCE((raw_data->'quotaMap'->'inv.inputWatts'->>'val')::decimal, 0) +
            COALESCE((raw_data->'quotaMap'->'mppt.inWatts'->>'val')::decimal, 0)
          )
        WHERE raw_data IS NOT NULL 
          AND raw_data::text != '{}'
          AND raw_data::text != 'null'
          AND raw_data->'quotaMap' IS NOT NULL
          AND (
            (raw_data->'quotaMap'->'pd.wattsInSum'->>'val')::decimal > 0
            OR (raw_data->'quotaMap'->'mppt.inWatts'->>'val')::decimal > 0
          )
        RETURNING 1
      )
      SELECT count(*)::integer as updated FROM updated
    `)

    const totalInputCount = totalInputResult[0]?.updated || 0
    console.log(`✅ Fixed total input_watts for ${totalInputCount} records based on pd.wattsInSum/mppt.inWatts`)

    return NextResponse.json({
      success: true,
      message: 'AC/DC input columns added and backfilled successfully',
      backfilledBreakdown: breakdownCount,
      fixedTotalInput: totalInputCount,
      totalUpdated: breakdownCount + totalInputCount
    })
  } catch (error) {
    console.error('❌ Failed to add input columns:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}
