import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { executeQuery } from '@/lib/database';

interface SessionSettings {
  user_id: string;
  session_timeout_minutes: number;
  auto_logout_enabled: boolean;
  remember_me_duration_days: number;
  force_logout_on_new_device: boolean;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's session settings
    const settings = await executeQuery(
      `SELECT * FROM session_settings WHERE user_id = $1`,
      [user.id]
    ) as SessionSettings[];

    if (settings.length === 0) {
      // Create default settings if none exist
      const defaultSettings = {
        user_id: user.id,
        session_timeout_minutes: 30, // Default 30 minutes
        auto_logout_enabled: true,
        remember_me_duration_days: 30,
        force_logout_on_new_device: false
      };

      await executeQuery(
        `INSERT INTO session_settings (user_id, session_timeout_minutes, auto_logout_enabled, remember_me_duration_days, force_logout_on_new_device)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          defaultSettings.user_id, 
          defaultSettings.session_timeout_minutes, 
          defaultSettings.auto_logout_enabled,
          defaultSettings.remember_me_duration_days,
          defaultSettings.force_logout_on_new_device
        ]
      );

      return NextResponse.json({
        success: true,
        settings: defaultSettings
      });
    }

    return NextResponse.json({
      success: true,
      settings: settings[0]
    });

  } catch (error) {
    console.error('Session settings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      sessionTimeoutMinutes, 
      autoLogoutEnabled, 
      rememberMeDurationDays,
      forceLogoutOnNewDevice 
    } = body;

    // Validate inputs
    if (typeof sessionTimeoutMinutes !== 'number' || sessionTimeoutMinutes < 5 || sessionTimeoutMinutes > 480) {
      return NextResponse.json(
        { error: 'Session timeout must be between 5 and 480 minutes (8 hours)' },
        { status: 400 }
      );
    }

    if (typeof rememberMeDurationDays !== 'number' || rememberMeDurationDays < 1 || rememberMeDurationDays > 365) {
      return NextResponse.json(
        { error: 'Remember me duration must be between 1 and 365 days' },
        { status: 400 }
      );
    }

    // Update settings
    await executeQuery(
      `INSERT INTO session_settings (user_id, session_timeout_minutes, auto_logout_enabled, remember_me_duration_days, force_logout_on_new_device, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         session_timeout_minutes = $2,
         auto_logout_enabled = $3,
         remember_me_duration_days = $4,
         force_logout_on_new_device = $5,
         updated_at = NOW()`,
      [user.id, sessionTimeoutMinutes, autoLogoutEnabled, rememberMeDurationDays, forceLogoutOnNewDevice]
    );

    // Get updated settings
    const updatedSettings = await executeQuery(
      `SELECT * FROM session_settings WHERE user_id = $1`,
      [user.id]
    ) as SessionSettings[];

    return NextResponse.json({
      success: true,
      settings: updatedSettings[0],
      message: 'Session settings updated successfully'
    });

  } catch (error) {
    console.error('Session settings update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}