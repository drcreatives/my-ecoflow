'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { 
  SettingsIcon,
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
import { 
  useProfile, 
  useNotificationSettings, 
  useDataRetentionSettings, 
  useSessionSettings,
  useUpdateProfile,
  useChangePassword,
  useUpdateNotificationSettings,
  useUpdateDataRetentionSettings,
  useUpdateSessionSettings,
  useExportData
} from '@/hooks/useProfile'
import { useTestEmail } from '@/hooks/useSystem'
import { cn } from '@/lib/utils'

function SettingsPage() {
  const { user, logout } = useAuthStore()
  const { notifications, clearAllNotifications } = useUIStore()
  const router = useRouter()
  
  // TanStack Query hooks for data management
  const profileQuery = useProfile()
  const notificationSettingsQuery = useNotificationSettings()
  const dataSettingsQuery = useDataRetentionSettings()
  const securitySettingsQuery = useSessionSettings()
  
  // Mutations
  const updateProfile = useUpdateProfile()
  const updateNotificationSettings = useUpdateNotificationSettings()
  const updateDataSettings = useUpdateDataRetentionSettings()
  const updateSecuritySettings = useUpdateSessionSettings()
  const changePassword = useChangePassword()
  const exportData = useExportData()
  const testEmail = useTestEmail()
  
  // Data destructuring
  const profile = profileQuery.data
  const notificationSettings = notificationSettingsQuery.data
  const dataSettings = dataSettingsQuery.data
  const securitySettings = securitySettingsQuery.data
  const loading = profileQuery.isLoading || notificationSettingsQuery.isLoading || 
                  dataSettingsQuery.isLoading || securitySettingsQuery.isLoading
  
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

  // Handle profile form submission
  const handleProfileSave = async () => {
    if (!profile?.firstName?.trim()) {
      toast.error('First name is required')
      return
    }
    if (!profile?.lastName?.trim()) {
      toast.error('Last name is required')
      return
    }
    
    try {
      await updateProfile.mutateAsync(profile)
      toast.success('Profile updated successfully')
    } catch (error) {
      toast.error('Failed to update profile')
    }
  }

  // Handle notification settings toggle
  const handleNotificationToggle = async (key: keyof typeof notificationSettings) => {
    if (!notificationSettings) return
    
    const newSettings = {
      ...notificationSettings,
      [key]: !notificationSettings[key]
    }
    
    try {
      await updateNotificationSettings.mutateAsync(newSettings)
      toast.success('Notification settings updated')
    } catch (error) {
      toast.error('Failed to update notification settings')
    }
  }

  // Handle password change
  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword) {
      toast.error('Current password is required')
      return
    }
    if (!passwordForm.newPassword) {
      toast.error('New password is required')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    
    try {
      await changePassword.mutateAsync({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
      toast.success('Password updated successfully')
      setShowPasswordForm(false)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      toast.error('Failed to update password')
    }
  }

  // Handle test email
  const handleTestEmail = async () => {
    try {
      await testEmail.mutateAsync()
    } catch (error) {
      // Error handling is done by the mutation hook
    }
  }

  // Handle data export
  const handleExportData = async (format: 'json' | 'csv') => {
    try {
      await exportData.mutateAsync({ format })
      toast.success('Data exported successfully')
    } catch (error) {
      toast.error('Failed to export data')
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center min-h-[50vh]">
          <Loader2 size={48} className="text-accent-green animate-spin" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-accent-gray">Settings</h1>
          <p className="text-accent-gray opacity-70">
            Manage your account, preferences, and application settings
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-primary-dark rounded-lg border border-gray-700">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0">
            {[
              { id: 'profile', label: 'Profile', icon: User },
              { id: 'notifications', label: 'Notifications', icon: Bell },
              { id: 'data', label: 'Data & Storage', icon: Database },
              { id: 'security', label: 'Security', icon: Shield }
            ].map((tab, index) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "p-4 flex flex-col sm:flex-row items-center gap-2 transition-all",
                    "border-gray-700 text-center sm:text-left",
                    index < 3 && "border-r",
                    activeTab === tab.id 
                      ? "bg-accent-green text-black" 
                      : "text-accent-gray hover:bg-gray-800"
                  )}
                >
                  <Icon size={20} />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-primary-dark rounded-lg border border-gray-700 p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="text-accent-green" size={24} />
                <h2 className="text-xl font-bold text-accent-gray">Profile Information</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-accent-gray mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={profile?.email || ''}
                    readOnly
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-accent-gray opacity-50 cursor-not-allowed"
                  />
                  <p className="text-xs text-accent-gray opacity-70 mt-1">
                    Email cannot be changed
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-accent-gray mb-2">
                    Member Since
                  </label>
                  <input
                    type="text"
                    value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : ''}
                    readOnly
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-accent-gray opacity-50 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-accent-gray mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={profile?.firstName || ''}
                    onChange={(e) => {
                      // For optimistic updates, we'll just update locally and save on blur/submit
                      // updateProfile.mutate({ ...profile, firstName: e.target.value })
                    }}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-accent-gray focus:ring-2 focus:ring-accent-green focus:border-transparent"
                    placeholder="Enter your first name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-accent-gray mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={profile?.lastName || ''}
                    onChange={(e) => {
                      // For optimistic updates, we'll just update locally and save on blur/submit
                      // updateProfile.mutate({ ...profile, lastName: e.target.value })
                    }}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-accent-gray focus:ring-2 focus:ring-accent-green focus:border-transparent"
                    placeholder="Enter your last name"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleProfileSave}
                  disabled={updateProfile.isPending}
                  className="bg-accent-green hover:bg-accent-green-secondary text-black font-medium px-6 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {updateProfile.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Save Profile
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <Bell className="text-accent-green" size={24} />
                <h2 className="text-xl font-bold text-accent-gray">Notification Settings</h2>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'deviceAlerts', label: 'Device Alerts', desc: 'Get notified about device status changes' },
                  { key: 'lowBattery', label: 'Low Battery Warnings', desc: 'Alert when battery levels are critically low' },
                  { key: 'powerThreshold', label: 'Power Threshold Alerts', desc: 'Notify when power usage exceeds thresholds' },
                  { key: 'systemUpdates', label: 'System Updates', desc: 'Get notified about app and firmware updates' },
                  { key: 'weeklyReports', label: 'Weekly Reports', desc: 'Receive weekly energy usage summaries' },
                  { key: 'emailNotifications', label: 'Email Notifications', desc: 'Send notifications to your email' },
                  { key: 'pushNotifications', label: 'Push Notifications', desc: 'Show notifications in your browser' }
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                    <div className="flex-1">
                      <h3 className="font-medium text-accent-gray">{label}</h3>
                      <p className="text-sm text-accent-gray opacity-70">{desc}</p>
                    </div>
                    <button
                      onClick={() => handleNotificationToggle(key as keyof typeof notificationSettings)}
                      disabled={updateNotificationSettings.isPending}
                      className={cn(
                        "relative w-12 h-6 rounded-full transition-colors duration-200",
                        notificationSettings?.[key as keyof typeof notificationSettings] 
                          ? "bg-accent-green" 
                          : "bg-gray-600"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200",
                          notificationSettings?.[key as keyof typeof notificationSettings] 
                            ? "translate-x-6" 
                            : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleTestEmail}
                  disabled={testEmail.isPending}
                  className="border border-accent-green text-accent-green hover:bg-accent-green hover:text-black font-medium px-6 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {testEmail.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Mail size={16} />
                  )}
                  Send Test Email
                </button>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <Database className="text-accent-green" size={24} />
                <h2 className="text-xl font-bold text-accent-gray">Data & Storage Settings</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-accent-gray mb-2">
                    Data Retention Period (days)
                  </label>
                  <select
                    value={dataSettings?.retentionPeriod || 90}
                    onChange={(e) => updateDataSettings.mutate({ 
                      ...dataSettings, 
                      retentionPeriod: parseInt(e.target.value) 
                    })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-accent-gray focus:ring-2 focus:ring-accent-green focus:border-transparent"
                  >
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-accent-gray mb-2">
                    Data Collection Interval (minutes)
                  </label>
                  <select
                    value={dataSettings?.collectInterval || 5}
                    onChange={(e) => updateDataSettings.mutate({ 
                      ...dataSettings, 
                      collectInterval: parseInt(e.target.value) 
                    })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-accent-gray focus:ring-2 focus:ring-accent-green focus:border-transparent"
                  >
                    <option value={1}>1 minute</option>
                    <option value={5}>5 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                  <div>
                    <h3 className="font-medium text-accent-gray">Automatic Backup</h3>
                    <p className="text-sm text-accent-gray opacity-70">
                      Automatically backup your data to cloud storage
                    </p>
                  </div>
                  <button
                    onClick={() => updateDataSettings.mutate({ 
                      ...dataSettings, 
                      autoBackup: !dataSettings?.autoBackup 
                    })}
                    className={cn(
                      "relative w-12 h-6 rounded-full transition-colors duration-200",
                      dataSettings?.autoBackup ? "bg-accent-green" : "bg-gray-600"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200",
                        dataSettings?.autoBackup ? "translate-x-6" : "translate-x-0.5"
                      )}
                    />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-accent-gray">Export Data</h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleExportData('json')}
                    disabled={exportData.isPending}
                    className="border border-accent-green text-accent-green hover:bg-accent-green hover:text-black font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Download size={16} />
                    Export JSON
                  </button>
                  <button
                    onClick={() => handleExportData('csv')}
                    disabled={exportData.isPending}
                    className="border border-accent-green text-accent-green hover:bg-accent-green hover:text-black font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Download size={16} />
                    Export CSV
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="text-accent-green" size={24} />
                <h2 className="text-xl font-bold text-accent-gray">Security Settings</h2>
              </div>

              {/* Password Change Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-accent-gray">Change Password</h3>
                    <p className="text-sm text-accent-gray opacity-70">
                      Last changed: {securitySettings?.passwordLastChanged || 'Never'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPasswordForm(!showPasswordForm)}
                    className="border border-accent-green text-accent-green hover:bg-accent-green hover:text-black font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Change Password
                  </button>
                </div>

                {showPasswordForm && (
                  <div className="space-y-4 p-4 bg-gray-800 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-accent-gray mb-2">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords.current ? 'text' : 'password'}
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-lg text-accent-gray focus:ring-2 focus:ring-accent-green focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-accent-gray hover:text-white"
                        >
                          {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-accent-gray mb-2">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords.new ? 'text' : 'password'}
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-lg text-accent-gray focus:ring-2 focus:ring-accent-green focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-accent-gray hover:text-white"
                        >
                          {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-accent-gray mb-2">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords.confirm ? 'text' : 'password'}
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-lg text-accent-gray focus:ring-2 focus:ring-accent-green focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-accent-gray hover:text-white"
                        >
                          {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={handlePasswordChange}
                        disabled={changePassword.isPending}
                        className="bg-accent-green hover:bg-accent-green-secondary text-black font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {changePassword.isPending ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Save size={16} />
                        )}
                        Update Password
                      </button>
                      <button
                        onClick={() => {
                          setShowPasswordForm(false)
                          setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                        }}
                        className="border border-gray-600 text-accent-gray hover:bg-gray-700 font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Two-Factor Authentication */}
              <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                <div>
                  <h3 className="font-medium text-accent-gray">Two-Factor Authentication</h3>
                  <p className="text-sm text-accent-gray opacity-70">
                    Add an extra layer of security to your account
                  </p>
                </div>
                <button
                  onClick={() => updateSecuritySettings.mutate({ 
                    ...securitySettings, 
                    twoFactorEnabled: !securitySettings?.twoFactorEnabled 
                  })}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-colors duration-200",
                    securitySettings?.twoFactorEnabled ? "bg-accent-green" : "bg-gray-600"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200",
                      securitySettings?.twoFactorEnabled ? "translate-x-6" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>

              {/* Session Timeout */}
              <div>
                <label className="block text-sm font-medium text-accent-gray mb-2">
                  Session Timeout (minutes)
                </label>
                <select
                  value={securitySettings?.sessionTimeout || 30}
                  onChange={(e) => updateSecuritySettings.mutate({ 
                    ...securitySettings, 
                    sessionTimeout: parseInt(e.target.value) 
                  })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-accent-gray focus:ring-2 focus:ring-accent-green focus:border-transparent"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={480}>8 hours</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// Wrap with authentication
export default function Settings() {
  return (
    <AuthWrapper>
      <SettingsPage />
    </AuthWrapper>
  )
}