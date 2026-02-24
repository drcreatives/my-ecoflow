'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { 
  Settings,
  User,
  Bell,
  Mail,
  Database,
  Shield,
  Trash2,
  Download,
  RefreshCw,
  Zap,
  Save,
  Eye,
  EyeOff,
  ChevronRight,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useConvexProfile, useConvexSettings, useConvexDevices } from '@/hooks/useConvexData'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvex } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { cn } from '@/lib/utils'

interface UserProfile {
  email: string
  firstName?: string
  lastName?: string
  createdAt: string
}

interface NotificationSettings {
  deviceAlerts: boolean
  lowBattery: boolean
  powerThreshold: boolean
  systemUpdates: boolean
  weeklyReports: boolean
  emailNotifications: boolean
  pushNotifications: boolean
}

interface DataSettings {
  retentionPeriod: number // days
  autoBackup: boolean
  exportFormat: 'json' | 'csv'
  collectInterval: number // minutes
}

interface SecuritySettings {
  twoFactorEnabled: boolean
  sessionTimeout: number // minutes
  passwordLastChanged: string
}

function SettingsPage() {
  // Convex reactive queries — no manual fetch needed
  const { profile: convexProfile, isLoading: profileLoading, updateProfile: convexUpdateProfile } = useConvexProfile()
  const {
    dataRetention: convexDataRetention,
    notifications: convexNotifications,
    isLoading: settingsLoading,
    updateDataRetention: convexUpdateDataRetention,
    updateNotifications: convexUpdateNotifications,
  } = useConvexSettings()
  const { signOut } = useAuthActions()
  const convex = useConvex()
  const { devices } = useConvexDevices()
  const { notifications, clearAllNotifications } = useUIStore()
  const userLoading = profileLoading || settingsLoading
  // Keep local UI state
  const [activeTab, setActiveTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  
  // Initialize local settings from store on load
  const [userProfile, setUserProfile] = useState<UserProfile>({
    email: '',
    firstName: '',
    lastName: '',
    createdAt: ''
  })
  
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    deviceAlerts: true,
    lowBattery: true,
    powerThreshold: true,
    systemUpdates: true,
    weeklyReports: false,
    emailNotifications: true,
    pushNotifications: false
  })
  
  const [dataSettings, setDataSettings] = useState<DataSettings>({
    retentionPeriod: 90,
    autoBackup: true,
    exportFormat: 'json',
    collectInterval: 5
  })
  
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    twoFactorEnabled: false,
    sessionTimeout: 30,
    passwordLastChanged: '2025-09-01'
  })

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })

  // Test email state
  const [testingEmail, setTestingEmail] = useState(false)

  // Sync profile from Convex reactive query
  useEffect(() => {
    if (convexProfile) {
      setUserProfile({
        email: convexProfile.email || '',
        firstName: convexProfile.firstName || '',
        lastName: convexProfile.lastName || '',
        createdAt: convexProfile.createdAt
          ? new Date(convexProfile.createdAt).toISOString()
          : new Date().toISOString()
      })
    }
  }, [convexProfile])

  // Sync notification settings from Convex
  useEffect(() => {
    if (convexNotifications) {
      setNotificationSettings({
        deviceAlerts: convexNotifications.deviceAlerts ?? true,
        lowBattery: convexNotifications.lowBattery ?? true,
        powerThreshold: convexNotifications.powerThreshold ?? false,
        systemUpdates: convexNotifications.systemUpdates ?? true,
        weeklyReports: convexNotifications.weeklyReports ?? false,
        emailNotifications: convexNotifications.emailNotifications ?? true,
        pushNotifications: convexNotifications.pushNotifications ?? false
      })
    }
  }, [convexNotifications])

  // Sync data retention settings from Convex
  useEffect(() => {
    if (convexDataRetention) {
      setDataSettings(prev => ({
        ...prev,
        retentionPeriod: convexDataRetention.retentionPeriodDays ?? 90,
        autoBackup: convexDataRetention.backupEnabled ?? false,
        collectInterval: convexDataRetention.collectionIntervalMinutes ?? 5,
      }))
    }
  }, [convexDataRetention])

  const saveSettings = async (settingsType: string, settings: any) => {
    setSaving(true)
    try {
      if (settingsType === 'userProfile') {
        // Validate profile data
        if (!settings.firstName || !settings.firstName.trim()) {
          toast.error('First name is required')
          return
        }

        if (!settings.lastName || !settings.lastName.trim()) {
          toast.error('Last name is required')
          return
        }

        if (settings.firstName.length > 50) {
          toast.error('First name must be less than 50 characters')
          return
        }

        if (settings.lastName.length > 50) {
          toast.error('Last name must be less than 50 characters')
          return
        }

        // Check for valid characters (letters, spaces, hyphens, apostrophes)
        const namePattern = /^[a-zA-Z\s\-']+$/
        if (!namePattern.test(settings.firstName)) {
          toast.error('First name contains invalid characters')
          return
        }

        if (!namePattern.test(settings.lastName)) {
          toast.error('Last name contains invalid characters')
          return
        }

        // Save via Convex mutation
        await convexUpdateProfile({
          firstName: settings.firstName.trim(),
          lastName: settings.lastName.trim()
        })
        
        toast.success('Profile updated successfully')
      } else if (settingsType === 'notificationSettings') {
        // Save via Convex mutation — pass all current toggle values
        await convexUpdateNotifications({
          deviceAlerts: settings.deviceAlerts,
          lowBattery: settings.lowBattery,
          powerThreshold: settings.powerThreshold,
          systemUpdates: settings.systemUpdates,
          weeklyReports: settings.weeklyReports,
          emailNotifications: settings.emailNotifications,
          pushNotifications: settings.pushNotifications,
        })
        
        toast.success('Notification settings updated successfully')
      } else if (settingsType === 'dataSettings') {
        // Validate data settings before saving
        if (settings.retentionPeriod < 1 || settings.retentionPeriod > 365) {
          toast.error('Retention period must be between 1 and 365 days')
          return
        }

        if (settings.collectInterval < 1 || settings.collectInterval > 1440) {
          toast.error('Collection interval must be between 1 and 1440 minutes')
          return
        }

        // Save via Convex mutation
        await convexUpdateDataRetention({
          retentionPeriodDays: settings.retentionPeriod,
          autoCleanupEnabled: true,
          backupEnabled: settings.autoBackup,
          collectionIntervalMinutes: settings.collectInterval,
        })
        toast.success('Data settings updated successfully')
      } else {
        // Save other settings to localStorage for now
        localStorage.setItem(settingsType, JSON.stringify(settings))
        toast.success('Settings saved successfully')
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save settings'
      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    // Comprehensive validation
    if (!passwordForm.currentPassword.trim()) {
      toast.error('Current password is required')
      return
    }

    if (!passwordForm.newPassword.trim()) {
      toast.error('New password is required')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    
    // Enhanced password strength validation
    if (passwordForm.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }

    // Check for common password requirements
    const hasUppercase = /[A-Z]/.test(passwordForm.newPassword)
    const hasLowercase = /[a-z]/.test(passwordForm.newPassword)
    const hasNumbers = /\d/.test(passwordForm.newPassword)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(passwordForm.newPassword)

    if (!hasUppercase || !hasLowercase || !hasNumbers) {
      toast.error('Password must contain uppercase, lowercase, and numbers')
      return
    }

    if (passwordForm.currentPassword === passwordForm.newPassword) {
      toast.error('New password must be different from current password')
      return
    }
    
    setSaving(true)
    try {
      // TODO: Password change not yet implemented with Convex Auth.
      // @convex-dev/auth doesn't expose a direct password-change API.
      // For now show a message; a future iteration can implement this via
      // a custom Convex action + bcrypt verification.
      toast.error('Password change is not yet available. Please use the forgot-password flow.')
      
    } catch (error) {
      console.error('Password change error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to change password'
      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    setTestingEmail(true)
    try {
      // Test emails are sent via Convex internal actions (triggered by device alerts)
      // A manual test can be triggered from the Convex Dashboard
      toast.info('Test emails are sent automatically when device alerts trigger. Check the Convex Dashboard for email logs.')
    } catch (error) {
      console.error('Test email error:', error)
      toast.error('Failed to send test email')
    } finally {
      setTestingEmail(false)
    }
  }

  const exportData = async (format: string = 'json') => {
    if (!['json', 'csv'].includes(format)) {
      toast.error('Invalid export format. Only JSON and CSV are supported.')
      return
    }

    setSaving(true)
    try {
      // Fetch readings from Convex (last 90 days by default)
      const now = Date.now()
      const startTime = now - (dataSettings.retentionPeriod * 24 * 60 * 60 * 1000)
      const historyResult = await convex.query(api.readings.history, {
        startTime,
        endTime: now + 24 * 60 * 60 * 1000,
        aggregation: 'raw',
      })

      const readings = historyResult?.readings ?? []

      let content: string
      let mimeType: string
      const filename = `ecoflow-export-${new Date().toISOString().split('T')[0]}.${format}`

      if (format === 'json') {
        const exportPayload = {
          exportedAt: new Date().toISOString(),
          profile: convexProfile ? {
            email: convexProfile.email,
            firstName: convexProfile.firstName,
            lastName: convexProfile.lastName,
          } : null,
          devices: (devices ?? []).map(d => ({
            deviceSn: d.deviceSn,
            deviceName: d.deviceName,
            deviceType: d.deviceType,
            isActive: d.isActive,
          })),
          settings: {
            dataRetention: convexDataRetention,
            notifications: convexNotifications,
          },
          readings: readings.map(r => ({
            deviceSn: r.deviceSn,
            deviceName: r.deviceName,
            batteryLevel: r.batteryLevel,
            inputWatts: r.inputWatts,
            outputWatts: r.outputWatts,
            acInputWatts: r.acInputWatts,
            dcInputWatts: r.dcInputWatts,
            acOutputWatts: r.acOutputWatts,
            dcOutputWatts: r.dcOutputWatts,
            usbOutputWatts: r.usbOutputWatts,
            remainingTime: r.remainingTime,
            temperature: r.temperature,
            status: r.status,
            recordedAt: new Date(r.recordedAt).toISOString(),
          })),
          totalReadings: readings.length,
        }
        content = JSON.stringify(exportPayload, null, 2)
        mimeType = 'application/json'
      } else {
        // CSV — readings only
        const headers = ['deviceSn','deviceName','recordedAt','batteryLevel','inputWatts','outputWatts','acInputWatts','dcInputWatts','acOutputWatts','dcOutputWatts','usbOutputWatts','remainingTime','temperature','status']
        const rows = readings.map(r => [
          r.deviceSn, r.deviceName, new Date(r.recordedAt).toISOString(),
          r.batteryLevel ?? '', r.inputWatts ?? '', r.outputWatts ?? '',
          r.acInputWatts ?? '', r.dcInputWatts ?? '', r.acOutputWatts ?? '',
          r.dcOutputWatts ?? '', r.usbOutputWatts ?? '', r.remainingTime ?? '',
          r.temperature ?? '', r.status,
        ].map(v => `"${v}"`).join(','))
        content = [headers.join(','), ...rows].join('\n')
        mimeType = 'text/csv'
      }

      // Trigger browser download
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`Data exported successfully as ${format.toUpperCase()} (${(blob.size / 1024).toFixed(1)} KB)`)
    } catch (error) {
      console.error('Export error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to export data'
      toast.error(`Export failed: ${errorMessage}`)
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'data', label: 'Data & Privacy', icon: Database },
    { id: 'security', label: 'Security', icon: Shield },
  ]

  if (userLoading) {
    return (
      
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto mb-4" />
            <p className="text-text-muted">Loading settings...</p>
          </div>
        </div>
      
    )
  }

  return (
    
      <div className="p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <Settings size={28} className="text-brand-primary" />
            <div>
              <h1 className="text-page-title font-medium text-text-primary">Settings</h1>
              <p className="text-text-muted">Manage your account and app preferences</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Navigation */}
            <div className="lg:col-span-1">
              <div className="bg-surface-1 border border-stroke-subtle rounded-card p-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-inner text-left transition-all duration-160 ease-dashboard",
                        activeTab === tab.id
                          ? "bg-brand-primary text-bg-base font-medium"
                          : "text-text-muted hover:text-text-primary hover:bg-surface-2"
                      )}
                    >
                      <Icon size={20} />
                      <span className="hidden sm:block">{tab.label}</span>
                      <ChevronRight size={16} className={cn(
                        "ml-auto transition-transform",
                        activeTab === tab.id ? "rotate-90" : ""
                      )} />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3">
              <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
                
                {/* Profile Tab */}
                {activeTab === 'profile' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-section-title font-medium text-text-primary mb-4">Profile Information</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-2">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={userProfile.email}
                            disabled
                            className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 disabled:opacity-60"
                          />
                          <p className="text-xs text-text-muted mt-1">Email cannot be changed</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-2">
                            Member Since
                          </label>
                          <input
                            type="text"
                            value={userProfile.createdAt ? new Date(userProfile.createdAt).toLocaleDateString() : 'Loading...'}
                            disabled
                            className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 disabled:opacity-60"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-2">
                            First Name
                          </label>
                          <input
                            type="text"
                            value={userProfile.firstName}
                            onChange={(e) => setUserProfile(prev => ({ ...prev, firstName: e.target.value }))}
                            className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40"
                            placeholder="Enter first name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-2">
                            Last Name
                          </label>
                          <input
                            type="text"
                            value={userProfile.lastName}
                            onChange={(e) => setUserProfile(prev => ({ ...prev, lastName: e.target.value }))}
                            className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40"
                            placeholder="Enter last name"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => saveSettings('userProfile', userProfile)}
                        disabled={saving}
                        className="mt-4 flex items-center gap-2 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-bg-base font-medium px-4 py-2 rounded-pill transition-all duration-160 ease-dashboard"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Profile
                      </button>
                    </div>

                    {/* Account Actions */}
                    <div className="border-t border-stroke-subtle pt-6">
                      <h3 className="text-lg font-medium text-text-primary mb-4">Account Actions</h3>
                      <div className="space-y-3">
                        <button
                          onClick={() => exportData('json')}
                          disabled={saving}
                          className="flex items-center gap-2 text-brand-primary hover:text-brand-primary/80 transition-colors"
                        >
                          <Download size={16} />
                          Export Account Data
                        </button>
                        <button
                          onClick={() => signOut()}
                          className="flex items-center gap-2 text-danger hover:text-danger/80 transition-colors"
                        >
                          <RefreshCw size={16} />
                          Sign Out of All Devices
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notifications Tab */}
                {activeTab === 'notifications' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-section-title font-medium text-text-primary mb-4">Notification Preferences</h2>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-surface-2 rounded-inner">
                          <div className="flex items-center gap-3">
                            <AlertTriangle className="text-danger" size={20} />
                            <div>
                              <div className="font-medium text-text-primary">Device Alerts</div>
                              <div className="text-sm text-text-muted">Critical device status notifications</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setNotificationSettings(prev => ({ ...prev, deviceAlerts: !prev.deviceAlerts }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              notificationSettings.deviceAlerts ? "bg-brand-primary" : "bg-stroke-strong"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 bg-white rounded-full transition-transform",
                              notificationSettings.deviceAlerts ? "translate-x-6" : "translate-x-0.5"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-surface-2 rounded-inner">
                          <div className="flex items-center gap-3">
                            <Zap className="text-warning" size={20} />
                            <div>
                              <div className="font-medium text-text-primary">Low Battery Alerts</div>
                              <div className="text-sm text-text-muted">When battery level drops below 20%</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setNotificationSettings(prev => ({ ...prev, lowBattery: !prev.lowBattery }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              notificationSettings.lowBattery ? "bg-brand-primary" : "bg-stroke-strong"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 bg-white rounded-full transition-transform",
                              notificationSettings.lowBattery ? "translate-x-6" : "translate-x-0.5"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-surface-2 rounded-inner">
                          <div className="flex items-center gap-3">
                            <Bell className="text-brand-tertiary" size={20} />
                            <div>
                              <div className="font-medium text-text-primary">Power Threshold Alerts</div>
                              <div className="text-sm text-text-muted">High power consumption warnings</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setNotificationSettings(prev => ({ ...prev, powerThreshold: !prev.powerThreshold }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              notificationSettings.powerThreshold ? "bg-brand-primary" : "bg-stroke-strong"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 bg-white rounded-full transition-transform",
                              notificationSettings.powerThreshold ? "translate-x-6" : "translate-x-0.5"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-surface-2 rounded-inner">
                          <div className="flex items-center gap-3">
                            <Mail className="text-success" size={20} />
                            <div>
                              <div className="font-medium text-text-primary">Email Notifications</div>
                              <div className="text-sm text-text-muted">Receive notifications via email</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setNotificationSettings(prev => ({ ...prev, emailNotifications: !prev.emailNotifications }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              notificationSettings.emailNotifications ? "bg-brand-primary" : "bg-stroke-strong"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 bg-white rounded-full transition-transform",
                              notificationSettings.emailNotifications ? "translate-x-6" : "translate-x-0.5"
                            )} />
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-3 mt-6">
                        <button
                          onClick={() => saveSettings('notificationSettings', notificationSettings)}
                          disabled={saving}
                          className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-bg-base font-medium px-4 py-2 rounded-pill transition-all duration-160 ease-dashboard"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          Save Preferences
                        </button>
                        
                        {notificationSettings.emailNotifications && (
                          <button
                            onClick={handleTestEmail}
                            disabled={testingEmail || saving}
                            className="flex items-center gap-2 bg-surface-2 hover:bg-surface-2/80 disabled:opacity-50 text-text-primary font-medium px-4 py-2 rounded-pill border border-stroke-subtle transition-all duration-160 ease-dashboard"
                          >
                            {testingEmail ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                            Test Email
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Clear Notifications */}
                    <div className="border-t border-stroke-subtle pt-6">
                      <h3 className="text-lg font-medium text-text-primary mb-4">Notification History</h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-text-primary">Current notifications: {notifications.length}</div>
                          <div className="text-sm text-text-muted">Clear notification history</div>
                        </div>
                        <button
                          onClick={clearAllNotifications}
                          className="flex items-center gap-2 text-danger hover:text-danger/80 transition-colors"
                        >
                          <Trash2 size={16} />
                          Clear All
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Data & Privacy Tab */}
                {activeTab === 'data' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-section-title font-medium text-text-primary mb-4">Data Management</h2>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-2">
                            Data Retention Period
                          </label>
                          <select
                            value={dataSettings.retentionPeriod}
                            onChange={(e) => setDataSettings(prev => ({ ...prev, retentionPeriod: parseInt(e.target.value) }))}
                            className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40"
                          >
                            <option value={30}>30 days</option>
                            <option value={90}>90 days</option>
                            <option value={180}>6 months</option>
                            <option value={365}>1 year</option>
                            <option value={730}>2 years</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-2">
                            Data Collection Interval
                          </label>
                          <select
                            value={dataSettings.collectInterval}
                            onChange={(e) => setDataSettings(prev => ({ ...prev, collectInterval: parseInt(e.target.value) }))}
                            className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40"
                          >
                            <option value={1}>1 minute</option>
                            <option value={2}>2 minutes</option>
                            <option value={5}>5 minutes</option>
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={60}>1 hour</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-surface-2 rounded-inner">
                          <div>
                            <div className="font-medium text-text-primary">Automatic Backup</div>
                            <div className="text-sm text-text-muted">Daily backup of device readings and settings</div>
                          </div>
                          <button
                            onClick={() => setDataSettings(prev => ({ ...prev, autoBackup: !prev.autoBackup }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              dataSettings.autoBackup ? "bg-brand-primary" : "bg-stroke-strong"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 bg-white rounded-full transition-transform",
                              dataSettings.autoBackup ? "translate-x-6" : "translate-x-0.5"
                            )} />
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => saveSettings('dataSettings', dataSettings)}
                        disabled={saving}
                        className="mt-4 flex items-center gap-2 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-bg-base font-medium px-4 py-2 rounded-pill transition-all duration-160 ease-dashboard"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Data Settings
                      </button>
                    </div>

                    {/* Data Export */}
                    <div className="border-t border-stroke-subtle pt-6">
                      <h3 className="text-lg font-medium text-text-primary mb-4">Data Export</h3>
                      <div className="space-y-3">
                        <button
                          onClick={() => exportData('json')}
                          disabled={saving}
                          className="flex items-center gap-2 text-brand-primary hover:text-brand-primary/80 transition-colors"
                        >
                          <Download size={16} />
                          Export All Data (JSON)
                        </button>
                        <button
                          onClick={() => exportData('csv')}
                          disabled={saving}
                          className="flex items-center gap-2 text-brand-tertiary hover:text-brand-tertiary/80 transition-colors"
                        >
                          <Download size={16} />
                          Export Readings (CSV)
                        </button>
                        <div className="text-sm text-text-muted">
                          Download a complete copy of your data including device readings, settings, and profile information.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-section-title font-medium text-text-primary mb-4">Security Settings</h2>
                      
                      {/* Password Section */}
                      <div className="p-4 bg-surface-2 rounded-inner mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="font-medium text-text-primary">Password</div>
                            <div className="text-sm text-text-muted">
                              Last changed: {new Date(securitySettings.passwordLastChanged).toLocaleDateString()}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowPasswordForm(!showPasswordForm)}
                            className="text-brand-primary hover:text-brand-primary/80 transition-colors"
                          >
                            Change Password
                          </button>
                        </div>

                        {showPasswordForm && (
                          <div className="space-y-4 border-t border-stroke-subtle pt-4">
                            <div>
                              <label className="block text-sm font-medium text-text-secondary mb-2">
                                Current Password
                              </label>
                              <div className="relative">
                                <input
                                  type={showPasswords.current ? "text" : "password"}
                                  value={passwordForm.currentPassword}
                                  onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                  className="w-full bg-bg-base border border-stroke-subtle rounded-inner px-3 py-2 pr-10 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40"
                                  placeholder="Enter current password"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary"
                                >
                                  {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-text-secondary mb-2">
                                New Password
                              </label>
                              <div className="relative">
                                <input
                                  type={showPasswords.new ? "text" : "password"}
                                  value={passwordForm.newPassword}
                                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                  className="w-full bg-bg-base border border-stroke-subtle rounded-inner px-3 py-2 pr-10 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40"
                                  placeholder="Enter new password"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary"
                                >
                                  {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-text-secondary mb-2">
                                Confirm New Password
                              </label>
                              <div className="relative">
                                <input
                                  type={showPasswords.confirm ? "text" : "password"}
                                  value={passwordForm.confirmPassword}
                                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                  className="w-full bg-bg-base border border-stroke-subtle rounded-inner px-3 py-2 pr-10 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40"
                                  placeholder="Confirm new password"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary"
                                >
                                  {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                            </div>
                            <div className="flex gap-3">
                              <button
                                onClick={handlePasswordChange}
                                disabled={saving || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                                className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-bg-base font-medium px-4 py-2 rounded-pill transition-all duration-160 ease-dashboard"
                              >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Update Password
                              </button>
                              <button
                                onClick={() => {
                                  setShowPasswordForm(false)
                                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                                }}
                                className="px-4 py-2 border border-stroke-subtle text-text-muted hover:text-text-primary hover:border-stroke-strong rounded-pill transition-all duration-160 ease-dashboard"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Session Settings */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-2">
                            Session Timeout
                          </label>
                          <select
                            value={securitySettings.sessionTimeout}
                            onChange={(e) => setSecuritySettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
                            className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40"
                          >
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={60}>1 hour</option>
                            <option value={120}>2 hours</option>
                            <option value={480}>8 hours</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={() => saveSettings('securitySettings', securitySettings)}
                            disabled={saving}
                            className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-bg-base font-medium px-4 py-2 rounded-pill transition-all duration-160 ease-dashboard"
                          >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Save Security Settings
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>
    
  )
}

export default function SettingsPageWrapper() {
  return (
    
      <SettingsPage />
    
  )
}