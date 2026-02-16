'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useDeviceStore } from '@/stores/deviceStore';
import Link from 'next/link';
import { 
  ArrowLeft,
  Settings,
  Edit3,
  Trash2,
  Power,
  AlertTriangle,
  CheckCircle,
  Save,
  X,
  Loader2,
  Info,
  Bell,
  Wifi,
  WifiOff
} from 'lucide-react';

interface DeviceSettingsPageProps {
  params: Promise<{ deviceId: string }>;
}

export default function DeviceSettingsPage({ params }: DeviceSettingsPageProps) {
  const { deviceId } = use(params);
  const router = useRouter();
  
  // Use Zustand store for device management  
  const { devices, isLoading: loading, error, fetchDevices, getDeviceById, updateDeviceSettings, unregisterDevice } = useDeviceStore();
  
  // Get device from store
  const device = getDeviceById(deviceId);
  
  // Keep local UI state for form management
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    deviceName: '',
    notifications: true,
    autoCollectData: true,
    alertThresholds: {
      lowBattery: 20,
      highTemperature: 60,
      powerLimit: 1000
    }
  });

  useEffect(() => {
    // Ensure devices are loaded
    if (devices.length === 0 && !loading) {
      fetchDevices();
    }
    
    // Initialize form data when device is available
    if (device) {
      setFormData({
        deviceName: device.deviceName,
        notifications: true,
        autoCollectData: !device.id.startsWith('temp-'),
        alertThresholds: {
          lowBattery: 20,
          highTemperature: 60,
          powerLimit: 1000
        }
      });
    }
  }, [devices.length, loading, fetchDevices, device]);

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(`/device/${deviceId}`);
    }
  };

  const handleSave = async () => {
    if (!device) return;
    
    try {
      setSaving(true);
      
      // Use store action to update device settings
      await updateDeviceSettings(deviceId, {
        deviceName: formData.deviceName
      });
      
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save device settings:', err);
      alert('Failed to save device settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDevice = async () => {
    if (!confirm('Are you sure you want to remove this device? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      
      // Use store action to unregister device
      await unregisterDevice(deviceId);
      
      router.push('/devices');
    } catch (err) {
      console.error('Failed to remove device:', err);
      alert('Failed to remove device. Please try again.');
      setSaving(false);
    }
  };

  if (loading || (devices.length === 0 && !error)) {
    return (
      
        
          <div className="min-h-screen text-text-secondary">
            <div className="container mx-auto px-4 py-8">
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 size={48} className="animate-spin text-brand-primary mb-4" />
                <h3 className="text-lg font-medium text-text-primary mb-2">Loading Device Settings</h3>
                <p className="text-text-muted">Fetching device configuration...</p>
              </div>
            </div>
          </div>
        
      
    );
  }

  if (error) {
    return (
      
        
          <div className="min-h-screen text-text-secondary flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-text-primary mb-2">Error Loading Settings</h1>
              <p className="text-text-secondary mb-6">{error}</p>
              <button
                onClick={handleBack}
                className="bg-brand-primary hover:bg-brand-primary/80 text-bg-base px-6 py-3 rounded-pill font-medium transition-all duration-160 ease-dashboard"
              >
                Go Back
              </button>
            </div>
          </div>
        
      
    );
  }

  if (!device && devices.length > 0 && !loading) {
    return (
      
        
          <div className="min-h-screen text-text-secondary flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-text-primary mb-2">Device Not Found</h1>
              <p className="text-text-secondary mb-6">The device you&apos;re looking for doesn&apos;t exist.</p>
              <button
                onClick={handleBack}
                className="bg-brand-primary hover:bg-brand-primary/80 text-bg-base px-6 py-3 rounded-pill font-medium transition-all duration-160 ease-dashboard"
              >
                Go Back
              </button>
            </div>
          </div>
        
      
    );
  }

  // Only render content if device is found and loaded
  if (!device) {
    return null // This should not happen due to previous checks, but keeps TypeScript happy
  }

  return (
    
      
        <div className="p-4 sm:p-6 text-text-secondary">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleBack}
                  className="p-2 hover:bg-surface-1 rounded-inner transition-all duration-160 ease-dashboard group"
                  title="Go back"
                >
                  <ArrowLeft className="w-5 h-5 group-hover:text-brand-primary transition-colors" />
                </button>
                <div>
                  <h1 className="text-page-title font-medium text-text-primary">Device Settings</h1>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="text-text-secondary text-sm">{device.deviceName}</span>
                    <div className="flex items-center space-x-1">
                      {device.online ? (
                        <Wifi className="w-4 h-4 text-brand-primary" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-danger" />
                      )}
                      <span className={`text-sm font-medium ${device.online ? 'text-brand-primary' : 'text-danger'}`}>
                        {device.online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Link
                  href={`/device/${device.id}`}
                  className="px-4 py-2 border border-stroke-subtle hover:border-stroke-strong rounded-pill transition-all duration-160 ease-dashboard text-text-primary"
                >
                  View Device
                </Link>
              </div>
            </div>

            {/* Settings Sections */}
            <div className="space-y-6">
              {/* Device Information */}
              <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-brand-primary" />
                    <h2 className="text-lg font-medium text-text-primary">Device Information</h2>
                  </div>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 px-3 py-2 bg-surface-2 hover:bg-surface-2/80 rounded-pill transition-all duration-160 ease-dashboard text-text-primary"
                    >
                      <Edit3 size={16} />
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setFormData(prev => ({ ...prev, deviceName: device.deviceName }));
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-surface-2 hover:bg-surface-2/80 rounded-pill transition-all duration-160 ease-dashboard text-text-primary"
                      >
                        <X size={16} />
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-3 py-2 bg-brand-primary hover:bg-brand-primary/90 text-bg-base rounded-pill transition-all duration-160 ease-dashboard disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">
                      Device Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.deviceName}
                        onChange={(e) => setFormData(prev => ({ ...prev, deviceName: e.target.value }))}
                        className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 focus:outline-none text-text-primary"
                      />
                    ) : (
                      <p className="text-text-primary font-medium">{device.deviceName}</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">
                      Serial Number
                    </label>
                    <p className="text-text-primary font-mono">{device.deviceSn}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">
                      Device Type
                    </label>
                    <p className="text-text-primary">{device.deviceType || 'DELTA 2'}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">
                      Status
                    </label>
                    <div className="flex items-center gap-2">
                      {device.online ? (
                        <CheckCircle className="w-4 h-4 text-brand-primary" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-danger" />
                      )}
                      <span className={device.online ? 'text-brand-primary' : 'text-danger'}>
                        {device.online ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Collection Settings */}
              <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Power className="w-5 h-5 text-brand-primary" />
                  <h2 className="text-lg font-medium text-text-primary">Data Collection</h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-surface-2/50 rounded-inner">
                    <div>
                      <h3 className="font-medium text-text-primary">Analytics Enabled</h3>
                      <p className="text-sm text-text-muted">
                        {formData.autoCollectData 
                          ? 'Device is registered for data collection and analytics'
                          : 'Register device to enable data collection and analytics'
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {formData.autoCollectData ? (
                        <CheckCircle className="w-5 h-5 text-brand-primary" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-warning" />
                      )}
                      <span className={formData.autoCollectData ? 'text-brand-primary' : 'text-warning'}>
                        {formData.autoCollectData ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {!formData.autoCollectData && (
                    <div className="p-4 bg-warning/5 border border-warning/15 rounded-inner">
                      <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-warning mt-0.5" />
                        <div>
                          <h4 className="font-medium text-warning mb-1">Analytics Disabled</h4>
                          <p className="text-sm text-text-muted mb-3">
                            This device is not registered for data collection. Enable analytics to track historical data, receive alerts, and access advanced monitoring features.
                          </p>
                          <Link
                            href="/devices/add"
                            className="inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-primary/90 text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160 ease-dashboard"
                          >
                            Register Device
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notification Settings */}
              <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Bell className="w-5 h-5 text-brand-primary" />
                  <h2 className="text-lg font-medium text-text-primary">Notifications</h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-surface-2/50 rounded-inner">
                    <div>
                      <h3 className="font-medium text-text-primary">Push Notifications</h3>
                      <p className="text-sm text-text-muted">Receive alerts for device status changes</p>
                    </div>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, notifications: !prev.notifications }))}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        formData.notifications ? 'bg-brand-primary' : 'bg-stroke-strong'
                      }`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          formData.notifications ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-surface-2/30 rounded-inner">
                      <label className="block text-sm font-medium text-text-muted mb-2">
                        Low Battery Alert (%)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="50"
                        value={formData.alertThresholds.lowBattery}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          alertThresholds: { ...prev.alertThresholds, lowBattery: parseInt(e.target.value) }
                        }))}
                        className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 focus:outline-none text-text-primary"
                      />
                    </div>

                    <div className="p-4 bg-surface-2/30 rounded-inner">
                      <label className="block text-sm font-medium text-text-muted mb-2">
                        High Temperature Alert (°C)
                      </label>
                      <input
                        type="number"
                        min="40"
                        max="80"
                        value={formData.alertThresholds.highTemperature}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          alertThresholds: { ...prev.alertThresholds, highTemperature: parseInt(e.target.value) }
                        }))}
                        className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 focus:outline-none text-text-primary"
                      />
                    </div>

                    <div className="p-4 bg-surface-2/30 rounded-inner">
                      <label className="block text-sm font-medium text-text-muted mb-2">
                        Power Limit Alert (W)
                      </label>
                      <input
                        type="number"
                        min="500"
                        max="2000"
                        step="100"
                        value={formData.alertThresholds.powerLimit}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          alertThresholds: { ...prev.alertThresholds, powerLimit: parseInt(e.target.value) }
                        }))}
                        className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 focus:outline-none text-text-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-surface-1 rounded-card border border-danger/20 shadow-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <AlertTriangle className="w-5 h-5 text-danger" />
                  <h2 className="text-lg font-medium text-text-primary">Danger Zone</h2>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-danger/5 border border-danger/15 rounded-inner">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-text-primary mb-1">Remove Device</h3>
                        <p className="text-sm text-text-muted">
                          Remove this device from your dashboard. This action cannot be undone.
                        </p>
                      </div>
                      <button
                        onClick={handleRemoveDevice}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-danger hover:bg-danger/90 text-text-primary rounded-pill transition-all duration-160 ease-dashboard disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        Remove Device
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </div>
      
    
  );
}