import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/database';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the latest reading for each device belonging to this user
    const latestReadings = await executeQuery(`
      SELECT 
        dr.device_id,
        dr.recorded_at,
        dr.battery_level,
        dr.input_watts,
        dr.output_watts,
        dr.temperature,
        d.device_name,
        d.device_sn
      FROM device_readings dr
      INNER JOIN devices d ON dr.device_id = d.id
      WHERE d.user_id = $1
        AND dr.recorded_at = (
          SELECT MAX(recorded_at) 
          FROM device_readings dr2 
          WHERE dr2.device_id = dr.device_id
        )
      ORDER BY dr.recorded_at DESC
    `, [user.id]);

    // Transform to camelCase for frontend consistency
    const transformedReadings = latestReadings.map(reading => ({
      deviceId: reading.device_id,
      recordedAt: reading.recorded_at,
      batteryLevel: reading.battery_level,
      inputWatts: reading.input_watts,
      outputWatts: reading.output_watts,
      temperature: reading.temperature,
      deviceName: reading.device_name,
      deviceSn: reading.device_sn
    }));

    return NextResponse.json(transformedReadings);

  } catch (error) {
    console.error('Latest readings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}