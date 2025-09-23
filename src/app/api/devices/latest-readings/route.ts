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
        dr.output_watts,
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

    return NextResponse.json(latestReadings);

  } catch (error) {
    console.error('Latest readings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}