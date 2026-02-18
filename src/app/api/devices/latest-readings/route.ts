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
    // Returns all fields the client DeviceReading interface expects.
    const latestReadings = await executeQuery(`
      SELECT 
        dr.id,
        dr.device_id        AS "deviceId",
        dr.battery_level     AS "batteryLevel",
        dr.input_watts       AS "inputWatts",
        dr.output_watts      AS "outputWatts",
        dr.ac_output_watts   AS "acOutputWatts",
        dr.dc_output_watts   AS "dcOutputWatts",
        dr.usb_output_watts  AS "usbOutputWatts",
        dr.remaining_time    AS "remainingTime",
        dr.temperature,
        dr.status,
        dr.recorded_at       AS "recordedAt",
        d.device_name        AS "deviceName",
        d.device_sn          AS "deviceSn"
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