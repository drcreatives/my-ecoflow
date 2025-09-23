'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { 
  Settings,
  User,
  Bell,
  BellOff,
  Smartphone,
  Mail,
  Database,
  Shield,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Clock,
  Zap,
  Save,
  Eye,
  EyeOff,
  ChevronRight,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import { AppLayout } from '@/components/layout'
import AuthWrapper from '@/components/AuthWrapper'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useProfile } from '@/hooks/useProfile'
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
  const { user, logout } = useAuthStore()
  const { notifications, clearAllNotifications } = useUIStore()
  const router = useRouter()
  
  // TanStack Query hooks for data management
  const {
    profile,
    notificationSettings,
    dataSettings,
    securitySettings,
    isLoading: loading,
    updateProfile,
    updateNotificationSettings,
    updateDataSettings,
    updateSecuritySettings,
    testEmailNotifications,
    changePassword,
    exportData,
    importData,
    clearAllData
  } = useProfile()
  
  // Local UI state
  const [activeTab, setActiveTab] = useState('profile')
  const [saving, setSaving] = useState(false)

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

        // Save user profile via API
        const response = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            firstName: settings.firstName.trim(),
            lastName: settings.lastName.trim()
          })
        })
        
        if (response.ok) {
          const { profile } = await response.json()
          setUserProfile(profile)
          toast.success('Profile updated successfully')
        } else {
          const error = await response.json()
          toast.error(error.error || 'Failed to update profile')
        }
      } else if (settingsType === 'notificationSettings') {
        // Save notification settings via API
        const response = await fetch('/api/user/notifications', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(settings)
        })
        
        if (response.ok) {
          const { settings: updatedSettings } = await response.json()
          setNotificationSettings({
            deviceAlerts: updatedSettings.deviceAlerts,
            lowBattery: updatedSettings.lowBattery,
            powerThreshold: updatedSettings.powerThreshold,
            systemUpdates: updatedSettings.systemUpdates,
            weeklyReports: updatedSettings.weeklyReports,
            emailNotifications: updatedSettings.emailNotifications,
            pushNotifications: updatedSettings.pushNotifications
          })
          toast.success('Notification settings updated successfully')
        } else {
          const error = await response.json()
          toast.error(error.error || 'Failed to update notification settings')
        }
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

        // Save data retention settings via API
        const response = await fetch('/api/user/data-retention', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            retentionPeriodDays: settings.retentionPeriod,
            autoCleanupEnabled: true, // Default to enabled for automatic cleanup
            backupEnabled: settings.autoBackup,
            collectionIntervalMinutes: settings.collectInterval
          })
        })
        
        if (response.ok) {
          const { settings: updatedSettings } = await response.json()
          setDataSettings({
            retentionPeriod: updatedSettings.retention_period_days,
            autoBackup: updatedSettings.backup_enabled,
            exportFormat: dataSettings.exportFormat, // Keep current format preference
            collectInterval: updatedSettings.collection_interval_minutes
          })
          toast.success('Data settings updated successfully')
        } else {
          const error = await response.json()
          toast.error(error.error || 'Failed to update data settings')
        }
      } else {
        // Save other settings to localStorage for now (will be API later)
        localStorage.setItem(settingsType, JSON.stringify(settings))
        toast.success('Settings saved successfully')
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      
      // Enhanced error handling with specific error types
      let errorMessage = 'Failed to save settings'
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Network error: Please check your internet connection'
      } else if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          errorMessage = 'Session expired. Please log in again.'
          // Optionally redirect to login
          // window.location.href = '/login'
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          errorMessage = 'You do not have permission to perform this action'
        } else if (error.message.includes('500')) {
          errorMessage = 'Server error. Please try again later.'
        } else if (error.message.includes('400')) {
          errorMessage = 'Invalid data provided. Please check your inputs.'
        } else {
          errorMessage = error.message
        }
      }
      
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
      // Call the actual password change API
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to change password')
      }
      
      setSecuritySettings(prev => ({
        ...prev,
        passwordLastChanged: new Date().toISOString().split('T')[0]
      }))
      
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setShowPasswordForm(false)
      toast.success('Password changed successfully. Please sign in again with your new password.')
      
      // Optionally redirect to login after password change
      // window.location.href = '/login'
      
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
      const response = await fetch('/api/email/test', {
        method: 'GET'
      })
      
      if (response.ok) {
        const result = await response.json()
        toast.success('Test email sent successfully! Check your inbox.')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to send test email')
      }
    } catch (error) {
      console.error('Test email error:', error)
      toast.error('Failed to send test email')
    } finally {
      setTestingEmail(false)
    }
  }

  const exportData = async (format: string = 'json') => {
    // Validate format
    if (!['json', 'csv'].includes(format)) {
      toast.error('Invalid export format. Only JSON and CSV are supported.')
      return
    }

    setSaving(true)
    try {
      // Call our data export API with backup endpoint
      const response = await fetch(`/api/user/backup?format=${format}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to export data' }))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to export data`)
      }

      // Check if response is actually file data
      const contentType = response.headers.get('content-type')
      if (!contentType || (!contentType.includes('application/json') && !contentType.includes('text/csv') && !contentType.includes('application/octet-stream'))) {
        throw new Error('Invalid response format from server')
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get('content-disposition')
      let filename = `ecoflow-export-${new Date().toISOString().split('T')[0]}.${format}`
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      // Create download
      const blob = await response.blob()
      
      // Validate blob size
      if (blob.size === 0) {
        throw new Error('Export file is empty')
      }

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

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-accent-green animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading settings...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <Settings size={28} className="text-accent-green" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
              <p className="text-gray-400">Manage your account and app preferences</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Navigation */}
            <div className="lg:col-span-1">
              <div className="bg-primary-dark border border-gray-700 rounded-lg p-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors",
                        activeTab === tab.id
                          ? "bg-accent-green text-black font-medium"
                          : "text-gray-400 hover:text-white hover:bg-gray-700"
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
              <div className="bg-primary-dark border border-gray-700 rounded-lg p-6">
                
                {/* Profile Tab */}
                {activeTab === 'profile' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-4">Profile Information</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={userProfile.email}
                            disabled
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green disabled:opacity-60"
                          />
                          <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Member Since
                          </label>
                          <input
                            type="text"
                            value={new Date(userProfile.createdAt).toLocaleDateString()}
                            disabled
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green disabled:opacity-60"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            First Name
                          </label>
                          <input
                            type="text"
                            value={userProfile.firstName}
                            onChange={(e) => setUserProfile(prev => ({ ...prev, firstName: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green"
                            placeholder="Enter first name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Last Name
                          </label>
                          <input
                            type="text"
                            value={userProfile.lastName}
                            onChange={(e) => setUserProfile(prev => ({ ...prev, lastName: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green"
                            placeholder="Enter last name"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => saveSettings('userProfile', userProfile)}
                        disabled={saving}
                        className="mt-4 flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 disabled:opacity-50 text-black font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Profile
                      </button>
                    </div>

                    {/* Account Actions */}
                    <div className="border-t border-gray-700 pt-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Account Actions</h3>
                      <div className="space-y-3">
                        <button
                          onClick={() => exportData('json')}
                          disabled={saving}
                          className="flex items-center gap-2 text-accent-green hover:text-accent-green/80 transition-colors"
                        >
                          <Download size={16} />
                          Export Account Data
                        </button>
                        <button
                          onClick={() => logout()}
                          className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
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
                      <h2 className="text-xl font-semibold text-white mb-4">Notification Preferences</h2>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <AlertTriangle className="text-red-400" size={20} />
                            <div>
                              <div className="font-medium text-white">Device Alerts</div>
                              <div className="text-sm text-gray-400">Critical device status notifications</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setNotificationSettings(prev => ({ ...prev, deviceAlerts: !prev.deviceAlerts }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              notificationSettings.deviceAlerts ? "bg-accent-green" : "bg-gray-600"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 bg-white rounded-full transition-transform",
                              notificationSettings.deviceAlerts ? "translate-x-6" : "translate-x-0.5"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Zap className="text-yellow-400" size={20} />
                            <div>
                              <div className="font-medium text-white">Low Battery Alerts</div>
                              <div className="text-sm text-gray-400">When battery level drops below 20%</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setNotificationSettings(prev => ({ ...prev, lowBattery: !prev.lowBattery }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              notificationSettings.lowBattery ? "bg-accent-green" : "bg-gray-600"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 bg-white rounded-full transition-transform",
                              notificationSettings.lowBattery ? "translate-x-6" : "translate-x-0.5"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Bell className="text-blue-400" size={20} />
                            <div>
                              <div className="font-medium text-white">Power Threshold Alerts</div>
                              <div className="text-sm text-gray-400">High power consumption warnings</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setNotificationSettings(prev => ({ ...prev, powerThreshold: !prev.powerThreshold }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              notificationSettings.powerThreshold ? "bg-accent-green" : "bg-gray-600"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 bg-white rounded-full transition-transform",
                              notificationSettings.powerThreshold ? "translate-x-6" : "translate-x-0.5"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Mail className="text-green-400" size={20} />
                            <div>
                              <div className="font-medium text-white">Email Notifications</div>
                              <div className="text-sm text-gray-400">Receive notifications via email</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setNotificationSettings(prev => ({ ...prev, emailNotifications: !prev.emailNotifications }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              notificationSettings.emailNotifications ? "bg-accent-green" : "bg-gray-600"
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
                          className="flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 disabled:opacity-50 text-black font-medium px-4 py-2 rounded-lg transition-colors"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          Save Preferences
                        </button>
                        
                        {notificationSettings.emailNotifications && (
                          <button
                            onClick={handleTestEmail}
                            disabled={testingEmail || saving}
                            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                          >
                            {testingEmail ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                            Test Email
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Clear Notifications */}
                    <div className="border-t border-gray-700 pt-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Notification History</h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white">Current notifications: {notifications.length}</div>
                          <div className="text-sm text-gray-400">Clear notification history</div>
                        </div>
                        <button
                          onClick={clearAllNotifications}
                          className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
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
                      <h2 className="text-xl font-semibold text-white mb-4">Data Management</h2>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Data Retention Period
                          </label>
                          <select
                            value={dataSettings.retentionPeriod}
                            onChange={(e) => setDataSettings(prev => ({ ...prev, retentionPeriod: parseInt(e.target.value) }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green"
                          >
                            <option value={30}>30 days</option>
                            <option value={90}>90 days</option>
                            <option value={180}>6 months</option>
                            <option value={365}>1 year</option>
                            <option value={730}>2 years</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Data Collection Interval
                          </label>
                          <select
                            value={dataSettings.collectInterval}
                            onChange={(e) => setDataSettings(prev => ({ ...prev, collectInterval: parseInt(e.target.value) }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green"
                          >
                            <option value={1}>1 minute</option>
                            <option value={5}>5 minutes</option>
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={60}>1 hour</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                          <div>
                            <div className="font-medium text-white">Automatic Backup</div>
                            <div className="text-sm text-gray-400">Daily backup of device readings and settings</div>
                          </div>
                          <button
                            onClick={() => setDataSettings(prev => ({ ...prev, autoBackup: !prev.autoBackup }))}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors",
                              dataSettings.autoBackup ? "bg-accent-green" : "bg-gray-600"
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
                        className="mt-4 flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 disabled:opacity-50 text-black font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Data Settings
                      </button>
                    </div>

                    {/* Data Export */}
                    <div className="border-t border-gray-700 pt-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Data Export</h3>
                      <div className="space-y-3">
                        <button
                          onClick={() => exportData('json')}
                          disabled={saving}
                          className="flex items-center gap-2 text-accent-green hover:text-accent-green/80 transition-colors"
                        >
                          <Download size={16} />
                          Export All Data (JSON)
                        </button>
                        <button
                          onClick={() => exportData('csv')}
                          disabled={saving}
                          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <Download size={16} />
                          Export Readings (CSV)
                        </button>
                        <div className="text-sm text-gray-400">
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
                      <h2 className="text-xl font-semibold text-white mb-4">Security Settings</h2>
                      
                      {/* Password Section */}
                      <div className="p-4 bg-gray-800 rounded-lg mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="font-medium text-white">Password</div>
                            <div className="text-sm text-gray-400">
                              Last changed: {new Date(securitySettings.passwordLastChanged).toLocaleDateString()}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowPasswordForm(!showPasswordForm)}
                            className="text-accent-green hover:text-accent-green/80 transition-colors"
                          >
                            Change Password
                          </button>
                        </div>

                        {showPasswordForm && (
                          <div className="space-y-4 border-t border-gray-700 pt-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-2">
                                Current Password
                              </label>
                              <div className="relative">
                                <input
                                  type={showPasswords.current ? "text" : "password"}
                                  value={passwordForm.currentPassword}
                                  onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 pr-10 text-white focus:outline-none focus:border-accent-green"
                                  placeholder="Enter current password"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                                >
                                  {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-2">
                                New Password
                              </label>
                              <div className="relative">
                                <input
                                  type={showPasswords.new ? "text" : "password"}
                                  value={passwordForm.newPassword}
                                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 pr-10 text-white focus:outline-none focus:border-accent-green"
                                  placeholder="Enter new password"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                                >
                                  {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-300 mb-2">
                                Confirm New Password
                              </label>
                              <div className="relative">
                                <input
                                  type={showPasswords.confirm ? "text" : "password"}
                                  value={passwordForm.confirmPassword}
                                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 pr-10 text-white focus:outline-none focus:border-accent-green"
                                  placeholder="Confirm new password"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                                >
                                  {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                            </div>
                            <div className="flex gap-3">
                              <button
                                onClick={handlePasswordChange}
                                disabled={saving || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                                className="flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 disabled:opacity-50 text-black font-medium px-4 py-2 rounded-lg transition-colors"
                              >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Update Password
                              </button>
                              <button
                                onClick={() => {
                                  setShowPasswordForm(false)
                                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                                }}
                                className="px-4 py-2 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg transition-colors"
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
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Session Timeout
                          </label>
                          <select
                            value={securitySettings.sessionTimeout}
                            onChange={(e) => setSecuritySettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green"
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
                            className="flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 disabled:opacity-50 text-black font-medium px-4 py-2 rounded-lg transition-colors"
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
      </div>
    </AppLayout>
  )
}

export default function SettingsPageWrapper() {
  return (
    <AuthWrapper>
      <SettingsPage />
    </AuthWrapper>
  )
}