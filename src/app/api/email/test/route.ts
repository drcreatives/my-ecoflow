import { NextRequest, NextResponse } from 'next/server';
import { sendTestEmail, sendDeviceAlert, sendSystemUpdate } from '@/lib/email-simple';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type, data } = body;

    if (!type) {
      return NextResponse.json(
        { error: 'Email type is required' },
        { status: 400 }
      );
    }

    let result;

    switch (type) {
      case 'test':
        result = await sendTestEmail(user.email!, user.id);
        break;

      case 'device_alert':
        if (!data || !data.deviceName || !data.alertType) {
          return NextResponse.json(
            { error: 'Device alert data is required' },
            { status: 400 }
          );
        }
        
        const deviceAlertData = {
          deviceName: data.deviceName,
          alertType: data.alertType,
          currentValue: data.currentValue,
          threshold: data.threshold,
          timestamp: new Date(),
          deviceSn: data.deviceSn || 'TEST-DEVICE-001'
        };
        
        result = await sendDeviceAlert(user.email!, deviceAlertData, user.id);
        break;

      case 'system_update':
        if (!data || !data.title || !data.description) {
          return NextResponse.json(
            { error: 'System update data is required' },
            { status: 400 }
          );
        }
        
        const systemUpdateData = {
          updateType: data.updateType || 'feature',
          title: data.title,
          description: data.description,
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined
        };
        
        result = await sendSystemUpdate(user.email!, systemUpdateData, user.id);
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid email type' },
          { status: 400 }
        );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Email API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Send a simple test email
    const result = await sendTestEmail(user.email!, user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send test email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Test email sent successfully',
      recipient: user.email
    });

  } catch (error) {
    console.error('Email test API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}