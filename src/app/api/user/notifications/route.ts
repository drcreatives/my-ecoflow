import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { executeQuery } from '@/lib/database'

interface NotificationSettings {
  id: string
  userId: string
  deviceAlerts: boolean
  lowBattery: boolean
  powerThreshold: boolean
  systemUpdates: boolean
  weeklyReports: boolean
  emailNotifications: boolean
  pushNotifications: boolean
  lowBatteryThreshold: number
  powerThresholdWatts: number
  createdAt: string
  updatedAt: string
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's notification settings
    const settings = await executeQuery<{
      id: string
      user_id: string
      device_alerts: boolean
      low_battery: boolean
      power_threshold: boolean
      system_updates: boolean
      weekly_reports: boolean
      email_notifications: boolean
      push_notifications: boolean
      low_battery_threshold: number
      power_threshold_watts: number
      created_at: string
      updated_at: string
    }>(
      `SELECT 
        id,
        user_id,
        device_alerts,
        low_battery,
        power_threshold,
        system_updates,
        weekly_reports,
        email_notifications,
        push_notifications,
        low_battery_threshold,
        power_threshold_watts,
        created_at,
        updated_at
      FROM notification_settings 
      WHERE user_id = $1`,
      [user.id]
    )

    if (settings.length === 0) {
      // Create default settings if they don't exist
      const defaultSettings = await executeQuery<{
        id: string
        user_id: string
        device_alerts: boolean
        low_battery: boolean
        power_threshold: boolean
        system_updates: boolean
        weekly_reports: boolean
        email_notifications: boolean
        push_notifications: boolean
        low_battery_threshold: number
        power_threshold_watts: number
        created_at: string
        updated_at: string
      }>(
        `INSERT INTO notification_settings (
          user_id, device_alerts, low_battery, power_threshold, 
          system_updates, weekly_reports, email_notifications, 
          push_notifications, low_battery_threshold, power_threshold_watts
        ) VALUES ($1, true, true, true, true, false, true, false, 20, 100)
        RETURNING 
          id, user_id, device_alerts, low_battery, power_threshold,
          system_updates, weekly_reports, email_notifications, 
          push_notifications, low_battery_threshold, power_threshold_watts,
          created_at, updated_at`,
        [user.id]
      )
      
      const setting = defaultSettings[0]
      return NextResponse.json({
        settings: {
          id: setting.id,
          userId: setting.user_id,
          deviceAlerts: setting.device_alerts,
          lowBattery: setting.low_battery,
          powerThreshold: setting.power_threshold,
          systemUpdates: setting.system_updates,
          weeklyReports: setting.weekly_reports,
          emailNotifications: setting.email_notifications,
          pushNotifications: setting.push_notifications,
          lowBatteryThreshold: setting.low_battery_threshold,
          powerThresholdWatts: setting.power_threshold_watts,
          createdAt: setting.created_at,
          updatedAt: setting.updated_at
        }
      })
    }

    const setting = settings[0]
    return NextResponse.json({
      settings: {
        id: setting.id,
        userId: setting.user_id,
        deviceAlerts: setting.device_alerts,
        lowBattery: setting.low_battery,
        powerThreshold: setting.power_threshold,
        systemUpdates: setting.system_updates,
        weeklyReports: setting.weekly_reports,
        emailNotifications: setting.email_notifications,
        pushNotifications: setting.push_notifications,
        lowBatteryThreshold: setting.low_battery_threshold,
        powerThresholdWatts: setting.power_threshold_watts,
        createdAt: setting.created_at,
        updatedAt: setting.updated_at
      }
    })
  } catch (error) {
    console.error('Error fetching notification settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notification settings' }, 
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      deviceAlerts,
      lowBattery,
      powerThreshold,
      systemUpdates,
      weeklyReports,
      emailNotifications,
      pushNotifications,
      lowBatteryThreshold,
      powerThresholdWatts
    } = body

    // Validate input
    if (lowBatteryThreshold && (lowBatteryThreshold < 0 || lowBatteryThreshold > 100)) {
      return NextResponse.json(
        { error: 'Low battery threshold must be between 0 and 100' }, 
        { status: 400 }
      )
    }

    if (powerThresholdWatts && (powerThresholdWatts < 0 || powerThresholdWatts > 10000)) {
      return NextResponse.json(
        { error: 'Power threshold must be between 0 and 10000 watts' }, 
        { status: 400 }
      )
    }

    // Update notification settings (upsert)
    const updatedSettings = await executeQuery<{
      id: string
      user_id: string
      device_alerts: boolean
      low_battery: boolean
      power_threshold: boolean
      system_updates: boolean
      weekly_reports: boolean
      email_notifications: boolean
      push_notifications: boolean
      low_battery_threshold: number
      power_threshold_watts: number
      created_at: string
      updated_at: string
    }>(
      `INSERT INTO notification_settings (
        user_id, device_alerts, low_battery, power_threshold, 
        system_updates, weekly_reports, email_notifications, 
        push_notifications, low_battery_threshold, power_threshold_watts,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        device_alerts = EXCLUDED.device_alerts,
        low_battery = EXCLUDED.low_battery,
        power_threshold = EXCLUDED.power_threshold,
        system_updates = EXCLUDED.system_updates,
        weekly_reports = EXCLUDED.weekly_reports,
        email_notifications = EXCLUDED.email_notifications,
        push_notifications = EXCLUDED.push_notifications,
        low_battery_threshold = EXCLUDED.low_battery_threshold,
        power_threshold_watts = EXCLUDED.power_threshold_watts,
        updated_at = NOW()
      RETURNING 
        id, user_id, device_alerts, low_battery, power_threshold,
        system_updates, weekly_reports, email_notifications, 
        push_notifications, low_battery_threshold, power_threshold_watts,
        created_at, updated_at`,
      [
        user.id,
        deviceAlerts ?? true,
        lowBattery ?? true,
        powerThreshold ?? true,
        systemUpdates ?? true,
        weeklyReports ?? false,
        emailNotifications ?? true,
        pushNotifications ?? false,
        lowBatteryThreshold ?? 20,
        powerThresholdWatts ?? 100
      ]
    )

    if (updatedSettings.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update notification settings' }, 
        { status: 500 }
      )
    }

    const setting = updatedSettings[0]
    return NextResponse.json({
      settings: {
        id: setting.id,
        userId: setting.user_id,
        deviceAlerts: setting.device_alerts,
        lowBattery: setting.low_battery,
        powerThreshold: setting.power_threshold,
        systemUpdates: setting.system_updates,
        weeklyReports: setting.weekly_reports,
        emailNotifications: setting.email_notifications,
        pushNotifications: setting.push_notifications,
        lowBatteryThreshold: setting.low_battery_threshold,
        powerThresholdWatts: setting.power_threshold_watts,
        createdAt: setting.created_at,
        updatedAt: setting.updated_at
      },
      message: 'Notification settings updated successfully'
    })
  } catch (error) {
    console.error('Error updating notification settings:', error)
    return NextResponse.json(
      { error: 'Failed to update notification settings' }, 
      { status: 500 }
    )
  }
}