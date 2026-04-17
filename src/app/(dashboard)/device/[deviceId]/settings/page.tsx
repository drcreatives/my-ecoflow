'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useConvexDevices, useConvexDeviceMutations, useConvexDeviceControl, useConvexSchedules } from '@/hooks/useConvexData';
import Link from 'next/link';
import { Toggle } from '@/components/ui/Toggle';
import { toast } from 'sonner';
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
  WifiOff,
  Zap,
  Clock,
  Plus,
  Calendar,
} from 'lucide-react';

interface DeviceSettingsPageProps {
  params: Promise<{ deviceId: string }>;
}

export default function DeviceSettingsPage({ params }: DeviceSettingsPageProps) {
  const { deviceId } = use(params);
  const router = useRouter();
  
  // Use Convex reactive queries — no manual fetch needed
  const { devices, isLoading: loading, error, getDeviceById } = useConvexDevices();
  const { updateDevice, unregisterDevice } = useConvexDeviceMutations();
  const deviceControl = useConvexDeviceControl();
  const { schedules, createSchedule, updateSchedule, removeSchedule } = useConvexSchedules(deviceId);
  
  // Get device from store
  const device = getDeviceById(deviceId);
  const reading = device?.currentReading;
  
  // Keep local UI state for form management
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: '',
    time: '08:00',
    daysOfWeek: [] as number[],
    action: 'acOn' as string,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
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

  // Initialize form data when device is available
  if (device && formData.deviceName === '') {
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
      
      // Use Convex mutation to update device
      await updateDevice(deviceId, {
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
      
      // Use Convex mutation to remove device
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

              {/* Device Configuration */}
              <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Zap className="w-5 h-5 text-brand-primary" />
                  <h2 className="text-lg font-medium text-text-primary">Device Configuration</h2>
                </div>

                <div className="space-y-6">
                  {/* Port Controls */}
                  <div>
                    <h3 className="text-sm font-medium text-text-muted mb-3">Port Controls</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-surface-2/50 rounded-inner">
                        <div>
                          <span className="text-sm font-medium text-text-primary">AC Output</span>
                          <p className="text-xs text-text-muted">Alternating current outlets</p>
                        </div>
                        <Toggle
                          checked={reading?.acEnabled ?? false}
                          disabled={deviceControl.isLoading || !device.online}
                          onToggle={async (checked) => {
                            try {
                              await deviceControl.setPortState({ deviceSn: device.deviceSn, port: "ac" as const, enabled: checked });
                              toast.success(`AC output ${checked ? 'enabled' : 'disabled'}`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed');
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-surface-2/50 rounded-inner">
                        <div>
                          <span className="text-sm font-medium text-text-primary">DC / USB Output</span>
                          <p className="text-xs text-text-muted">12V car port & USB ports</p>
                        </div>
                        <Toggle
                          checked={reading?.dcOutEnabled ?? false}
                          disabled={deviceControl.isLoading || !device.online}
                          onToggle={async (checked) => {
                            try {
                              await deviceControl.setPortState({ deviceSn: device.deviceSn, port: "dcUsb" as const, enabled: checked });
                              toast.success(`DC/USB output ${checked ? 'enabled' : 'disabled'}`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed');
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-surface-2/50 rounded-inner">
                        <div>
                          <span className="text-sm font-medium text-text-primary">Car Charger</span>
                          <p className="text-xs text-text-muted">12V car charging port</p>
                        </div>
                        <Toggle
                          checked={reading?.carChargerEnabled ?? false}
                          disabled={deviceControl.isLoading || !device.online}
                          onToggle={async (checked) => {
                            try {
                              await deviceControl.setPortState({ deviceSn: device.deviceSn, port: "car" as const, enabled: checked });
                              toast.success(`Car charger ${checked ? 'enabled' : 'disabled'}`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed');
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* AC Configuration */}
                  <div>
                    <h3 className="text-sm font-medium text-text-muted mb-3">AC Configuration</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-surface-2/50 rounded-inner">
                        <div>
                          <span className="text-sm font-medium text-text-primary">X-Boost</span>
                          <p className="text-xs text-text-muted">Extend AC output to 1800W</p>
                        </div>
                        <Toggle
                          checked={reading?.acXboost ?? false}
                          disabled={deviceControl.isLoading || !device.online}
                          onToggle={async (checked) => {
                            try {
                              await deviceControl.setAcConfig({ deviceSn: device.deviceSn, xboost: checked });
                              toast.success(`X-Boost ${checked ? 'enabled' : 'disabled'}`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed');
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Charging Configuration */}
                  <div>
                    <h3 className="text-sm font-medium text-text-muted mb-3">Charging</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 bg-surface-2/50 rounded-inner">
                        <label className="block text-sm font-medium text-text-primary mb-1">
                          AC Charging Watts
                        </label>
                        <p className="text-xs text-text-muted mb-2">Max AC charging speed (200-1200W)</p>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={200}
                            max={1200}
                            step={100}
                            defaultValue={reading?.acChargingWatts ?? 600}
                            disabled={!device.online}
                            className="flex-1 px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:outline-none text-text-primary text-sm disabled:opacity-50"
                            onBlur={async (e) => {
                              const val = parseInt(e.target.value);
                              if (isNaN(val) || val < 200 || val > 1200) return;
                              try {
                                await deviceControl.setChargingConfig({ deviceSn: device.deviceSn, chgWatts: val });
                                toast.success(`AC charging set to ${val}W`);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Failed');
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div className="p-3 bg-surface-2/50 rounded-inner">
                        <label className="block text-sm font-medium text-text-primary mb-1">
                          Max Charge Level
                        </label>
                        <p className="text-xs text-text-muted mb-2">Stop charging at this % (50-100)</p>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={50}
                            max={100}
                            defaultValue={reading?.maxChargeSoc ?? 100}
                            disabled={!device.online}
                            className="flex-1 px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:outline-none text-text-primary text-sm disabled:opacity-50"
                            onBlur={async (e) => {
                              const val = parseInt(e.target.value);
                              if (isNaN(val) || val < 50 || val > 100) return;
                              try {
                                await deviceControl.setBmsConfig({ deviceSn: device.deviceSn, maxChargeSoc: val });
                                toast.success(`Max charge level set to ${val}%`);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Failed');
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Standby Timers */}
                  <div>
                    <h3 className="text-sm font-medium text-text-muted mb-3">Standby Timers</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-surface-2/50 rounded-inner">
                        <label className="block text-sm font-medium text-text-primary mb-1">AC Standby</label>
                        <p className="text-xs text-text-muted mb-2">Minutes (0=never off)</p>
                        <input
                          type="number"
                          min={0}
                          max={720}
                          defaultValue={reading?.acStandbyMins ?? 0}
                          disabled={!device.online}
                          className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:outline-none text-text-primary text-sm disabled:opacity-50"
                          onBlur={async (e) => {
                            const val = parseInt(e.target.value);
                            if (isNaN(val) || val < 0) return;
                            try {
                              await deviceControl.setStandbyTimers({ deviceSn: device.deviceSn, acStandbyMins: val });
                              toast.success(`AC standby set to ${val} min`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed');
                            }
                          }}
                        />
                      </div>
                      <div className="p-3 bg-surface-2/50 rounded-inner">
                        <label className="block text-sm font-medium text-text-primary mb-1">DC Standby</label>
                        <p className="text-xs text-text-muted mb-2">Minutes (0=never off)</p>
                        <input
                          type="number"
                          min={0}
                          max={720}
                          defaultValue={reading?.carStandbyMins ?? 0}
                          disabled={!device.online}
                          className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:outline-none text-text-primary text-sm disabled:opacity-50"
                          onBlur={async (e) => {
                            const val = parseInt(e.target.value);
                            if (isNaN(val) || val < 0) return;
                            try {
                              await deviceControl.setStandbyTimers({ deviceSn: device.deviceSn, carStandbyMins: val });
                              toast.success(`DC standby set to ${val} min`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed');
                            }
                          }}
                        />
                      </div>
                      <div className="p-3 bg-surface-2/50 rounded-inner">
                        <label className="block text-sm font-medium text-text-primary mb-1">Unit Standby</label>
                        <p className="text-xs text-text-muted mb-2">Minutes (0=never off)</p>
                        <input
                          type="number"
                          min={0}
                          max={720}
                          defaultValue={reading?.unitStandbyMins ?? 0}
                          disabled={!device.online}
                          className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:outline-none text-text-primary text-sm disabled:opacity-50"
                          onBlur={async (e) => {
                            const val = parseInt(e.target.value);
                            if (isNaN(val) || val < 0) return;
                            try {
                              await deviceControl.setStandbyTimers({ deviceSn: device.deviceSn, unitStandbyMins: val });
                              toast.success(`Unit standby set to ${val} min`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed');
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Other */}
                  <div>
                    <h3 className="text-sm font-medium text-text-muted mb-3">Other</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-surface-2/50 rounded-inner">
                        <div>
                          <span className="text-sm font-medium text-text-primary">Buzzer Silent</span>
                          <p className="text-xs text-text-muted">Mute device beep sounds</p>
                        </div>
                        <Toggle
                          checked={reading?.buzzerSilent ?? false}
                          disabled={deviceControl.isLoading || !device.online}
                          onToggle={async (checked) => {
                            try {
                              await deviceControl.setBuzzer({ deviceSn: device.deviceSn, enabled: !checked });
                              toast.success(`Buzzer ${checked ? 'silenced' : 'enabled'}`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed');
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scheduled Rules */}
              <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-brand-primary" />
                    <h2 className="text-lg font-medium text-text-primary">Scheduled Rules</h2>
                  </div>
                  <button
                    onClick={() => setShowScheduleForm(!showScheduleForm)}
                    className="flex items-center gap-2 px-3 py-2 bg-brand-primary hover:bg-brand-primary/90 text-bg-base rounded-pill transition-all duration-160 ease-dashboard text-sm font-medium"
                  >
                    <Plus size={16} />
                    Add Rule
                  </button>
                </div>

                {/* New Schedule Form */}
                {showScheduleForm && (
                  <div className="mb-6 p-4 bg-surface-2/50 rounded-inner border border-stroke-subtle space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Morning AC On"
                        value={newSchedule.name}
                        onChange={(e) => setNewSchedule(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:outline-none text-text-primary text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Time</label>
                        <input
                          type="time"
                          value={newSchedule.time}
                          onChange={(e) => setNewSchedule(prev => ({ ...prev, time: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:outline-none text-text-primary text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Action</label>
                        <select
                          value={newSchedule.action}
                          onChange={(e) => setNewSchedule(prev => ({ ...prev, action: e.target.value }))}
                          className="w-full px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:outline-none text-text-primary text-sm"
                        >
                          <option value="acOn">Turn AC On</option>
                          <option value="acOff">Turn AC Off</option>
                          <option value="dcOn">Turn DC/USB On</option>
                          <option value="dcOff">Turn DC/USB Off</option>
                          <option value="carOn">Turn Car Charger On</option>
                          <option value="carOff">Turn Car Charger Off</option>
                          <option value="buzzerOn">Buzzer On</option>
                          <option value="buzzerOff">Buzzer Off (Silent)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">Days</label>
                      <div className="flex gap-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                          <button
                            key={day}
                            onClick={() => {
                              setNewSchedule(prev => ({
                                ...prev,
                                daysOfWeek: prev.daysOfWeek.includes(i)
                                  ? prev.daysOfWeek.filter(d => d !== i)
                                  : [...prev.daysOfWeek, i],
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-all duration-160 ${
                              newSchedule.daysOfWeek.includes(i)
                                ? 'bg-brand-primary text-bg-base'
                                : 'bg-surface-2 text-text-secondary border border-stroke-subtle'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-text-muted mt-1">Leave empty for every day</p>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setShowScheduleForm(false)}
                        className="px-4 py-2 bg-surface-2 hover:bg-surface-2/80 text-text-primary rounded-pill transition-all duration-160 text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!newSchedule.name.trim()) {
                            toast.error('Schedule name is required');
                            return;
                          }
                          const actionMap: Record<string, { moduleType: number; operateType: string; params: Record<string, unknown> }> = {
                            acOn: { moduleType: 5, operateType: "acOutCfg", params: { enabled: 1, xboost: reading?.acXboost ? 1 : 0, out_voltage: reading?.acOutVoltage ?? 220, out_freq: reading?.acOutFrequency ?? 50 } },
                            acOff: { moduleType: 5, operateType: "acOutCfg", params: { enabled: 0, xboost: reading?.acXboost ? 1 : 0, out_voltage: reading?.acOutVoltage ?? 220, out_freq: reading?.acOutFrequency ?? 50 } },
                            dcOn: { moduleType: 1, operateType: "dcOutCfg", params: { enabled: 1 } },
                            dcOff: { moduleType: 1, operateType: "dcOutCfg", params: { enabled: 0 } },
                            carOn: { moduleType: 5, operateType: "mpptCar", params: { enabled: 1 } },
                            carOff: { moduleType: 5, operateType: "mpptCar", params: { enabled: 0 } },
                            buzzerOn: { moduleType: 5, operateType: "quietMode", params: { enabled: 1 } },
                            buzzerOff: { moduleType: 5, operateType: "quietMode", params: { enabled: 0 } },
                          };
                          try {
                            await createSchedule({
                              deviceId,
                              name: newSchedule.name,
                              time: newSchedule.time,
                              daysOfWeek: newSchedule.daysOfWeek,
                              action: actionMap[newSchedule.action],
                              timezone: newSchedule.timezone,
                            });
                            toast.success('Schedule created');
                            setShowScheduleForm(false);
                            setNewSchedule({ name: '', time: '08:00', daysOfWeek: [], action: 'acOn', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Failed to create schedule');
                          }
                        }}
                        className="px-4 py-2 bg-brand-primary hover:bg-brand-primary/90 text-bg-base rounded-pill transition-all duration-160 text-sm font-medium"
                      >
                        Create Schedule
                      </button>
                    </div>
                  </div>
                )}

                {/* Schedule List */}
                {schedules.length === 0 && !showScheduleForm ? (
                  <div className="text-center py-8">
                    <Clock className="w-10 h-10 text-text-muted mx-auto mb-3" />
                    <p className="text-text-secondary text-sm">No scheduled rules yet</p>
                    <p className="text-text-muted text-xs mt-1">Create rules to automate device actions on a schedule</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedules.map((schedule) => (
                      <div key={schedule.id} className="flex items-center justify-between p-3 bg-surface-2/50 rounded-inner">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary truncate">{schedule.name}</span>
                            <span className="text-xs text-text-muted">{schedule.time}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-text-muted">
                              {schedule.daysOfWeek.length === 0
                                ? 'Every day'
                                : schedule.daysOfWeek.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}
                            </span>
                            {schedule.lastExecutedAt && (
                              <span className="text-xs text-text-muted">
                                • Last: {new Date(schedule.lastExecutedAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Toggle
                            checked={schedule.enabled}
                            onToggle={async (checked) => {
                              try {
                                await updateSchedule({ scheduleId: schedule.id, enabled: checked });
                                toast.success(`Schedule ${checked ? 'enabled' : 'disabled'}`);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Failed');
                              }
                            }}
                          />
                          <button
                            onClick={async () => {
                              if (!confirm('Delete this schedule?')) return;
                              try {
                                await removeSchedule(schedule.id);
                                toast.success('Schedule deleted');
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Failed');
                              }
                            }}
                            className="p-1.5 hover:bg-danger/10 rounded transition-colors"
                            title="Delete schedule"
                          >
                            <Trash2 size={14} className="text-danger" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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