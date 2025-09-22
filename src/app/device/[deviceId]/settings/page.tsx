'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft,
  Settings,
  Edit3,
  Trash2,
  Power,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Save,
  X,
  Loader2,
  Info,
  Bell,
  BellOff,
  Wifi,
  WifiOff
} from 'lucide-react';
import { AppLayout } from '@/components/layout';
import AuthWrapper from '@/components/AuthWrapper';
import { DeviceData } from '@/lib/data-utils';

interface DeviceSettingsPageProps {
  params: Promise<{ deviceId: string }>;
}

export default function DeviceSettingsPage({ params }: DeviceSettingsPageProps) {
  const { deviceId } = use(params);
  const router = useRouter();
  const [device, setDevice] = useState<DeviceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    fetchDeviceDetails();
  }, [deviceId]);

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(`/device/${deviceId}`);
    }
  };

  const fetchDeviceDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/devices');
      if (!response.ok) {
        throw new Error('Failed to fetch devices');
      }
      
      const data: { devices: DeviceData[], total: number } = await response.json();
      const deviceData = data.devices.find(d => d.id === deviceId);
      
      if (!deviceData) {
        throw new Error('Device not found');
      }
      
      setDevice(deviceData);
      setFormData({
        deviceName: deviceData.deviceName,
        notifications: true,
        autoCollectData: !deviceData.id.startsWith('temp-'),
        alertThresholds: {
          lowBattery: 20,
          highTemperature: 60,
          powerLimit: 1000
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Update device name
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceName: formData.deviceName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update device');
      }

      // Update local device data
      if (device) {
        setDevice({ ...device, deviceName: formData.deviceName });
      }
      
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
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
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove device');
      }

      router.push('/devices');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove device');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AuthWrapper>
        <AppLayout>
          <div className="min-h-screen bg-primary-black text-accent-gray">
            <div className="container mx-auto px-4 py-8">
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 size={48} className="animate-spin text-accent-green mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Loading Device Settings</h3>
                <p className="text-gray-400">Fetching device configuration...</p>
              </div>
            </div>
          </div>
        </AppLayout>
      </AuthWrapper>
    );
  }

  if (error) {
    return (
      <AuthWrapper>
        <AppLayout>
          <div className="min-h-screen bg-primary-black text-accent-gray flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">Error Loading Settings</h1>
              <p className="text-accent-gray mb-6">{error}</p>
              <button
                onClick={handleBack}
                className="bg-accent-green hover:bg-accent-green/80 text-primary-black px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </AppLayout>
      </AuthWrapper>
    );
  }

  if (!device) {
    return (
      <AuthWrapper>
        <AppLayout>
          <div className="min-h-screen bg-primary-black text-accent-gray flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white mb-2">Device Not Found</h1>
              <p className="text-accent-gray mb-6">The device you&apos;re looking for doesn&apos;t exist.</p>
              <button
                onClick={handleBack}
                className="bg-accent-green hover:bg-accent-green/80 text-primary-black px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </AppLayout>
      </AuthWrapper>
    );
  }

  return (
    <AuthWrapper>
      <AppLayout>
        <div className="min-h-screen bg-primary-black text-accent-gray">
          <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleBack}
                  className="p-2 hover:bg-primary-dark rounded-lg transition-colors group"
                  title="Go back"
                >
                  <ArrowLeft className="w-5 h-5 group-hover:text-accent-green transition-colors" />
                </button>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">Device Settings</h1>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="text-accent-gray text-sm">{device.deviceName}</span>
                    <div className="flex items-center space-x-1">
                      {device.online ? (
                        <Wifi className="w-4 h-4 text-accent-green" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-red-400" />
                      )}
                      <span className={`text-sm font-medium ${device.online ? 'text-accent-green' : 'text-red-400'}`}>
                        {device.online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Link
                  href={`/device/${device.id}`}
                  className="px-4 py-2 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors text-white"
                >
                  View Device
                </Link>
              </div>
            </div>

            {/* Settings Sections */}
            <div className="space-y-6">
              {/* Device Information */}
              <div className="bg-primary-dark rounded-lg border border-gray-800 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-accent-green" />
                    <h2 className="text-lg font-semibold text-white">Device Information</h2>
                  </div>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-white"
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
                        className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-white"
                      >
                        <X size={16} />
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-3 py-2 bg-accent-green hover:bg-accent-green/90 text-black rounded-lg transition-colors disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Device Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.deviceName}
                        onChange={(e) => setFormData(prev => ({ ...prev, deviceName: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-accent-green focus:outline-none text-white"
                      />
                    ) : (
                      <p className="text-white font-medium">{device.deviceName}</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Serial Number
                    </label>
                    <p className="text-white font-mono">{device.deviceSn}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Device Type
                    </label>
                    <p className="text-white">{device.deviceType || 'DELTA 2'}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Status
                    </label>
                    <div className="flex items-center gap-2">
                      {device.online ? (
                        <CheckCircle className="w-4 h-4 text-accent-green" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      )}
                      <span className={device.online ? 'text-accent-green' : 'text-red-400'}>
                        {device.online ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Collection Settings */}
              <div className="bg-primary-dark rounded-lg border border-gray-800 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Power className="w-5 h-5 text-accent-green" />
                  <h2 className="text-lg font-semibold text-white">Data Collection</h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                    <div>
                      <h3 className="font-medium text-white">Analytics Enabled</h3>
                      <p className="text-sm text-gray-400">
                        {formData.autoCollectData 
                          ? 'Device is registered for data collection and analytics'
                          : 'Register device to enable data collection and analytics'
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {formData.autoCollectData ? (
                        <CheckCircle className="w-5 h-5 text-accent-green" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                      )}
                      <span className={formData.autoCollectData ? 'text-accent-green' : 'text-yellow-400'}>
                        {formData.autoCollectData ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {!formData.autoCollectData && (
                    <div className="p-4 bg-yellow-900/20 border border-yellow-900/30 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-yellow-400 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-yellow-400 mb-1">Analytics Disabled</h4>
                          <p className="text-sm text-gray-400 mb-3">
                            This device is not registered for data collection. Enable analytics to track historical data, receive alerts, and access advanced monitoring features.
                          </p>
                          <Link
                            href="/devices/add"
                            className="inline-flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 text-black font-medium py-2 px-4 rounded-lg transition-colors"
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
              <div className="bg-primary-dark rounded-lg border border-gray-800 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Bell className="w-5 h-5 text-accent-green" />
                  <h2 className="text-lg font-semibold text-white">Notifications</h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                    <div>
                      <h3 className="font-medium text-white">Push Notifications</h3>
                      <p className="text-sm text-gray-400">Receive alerts for device status changes</p>
                    </div>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, notifications: !prev.notifications }))}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        formData.notifications ? 'bg-accent-green' : 'bg-gray-600'
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
                    <div className="p-4 bg-gray-800/30 rounded-lg">
                      <label className="block text-sm font-medium text-gray-400 mb-2">
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
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-accent-green focus:outline-none text-white"
                      />
                    </div>

                    <div className="p-4 bg-gray-800/30 rounded-lg">
                      <label className="block text-sm font-medium text-gray-400 mb-2">
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
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-accent-green focus:outline-none text-white"
                      />
                    </div>

                    <div className="p-4 bg-gray-800/30 rounded-lg">
                      <label className="block text-sm font-medium text-gray-400 mb-2">
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
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-accent-green focus:outline-none text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-primary-dark rounded-lg border border-red-900/30 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <h2 className="text-lg font-semibold text-white">Danger Zone</h2>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-red-900/20 border border-red-900/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white mb-1">Remove Device</h3>
                        <p className="text-sm text-gray-400">
                          Remove this device from your dashboard. This action cannot be undone.
                        </p>
                      </div>
                      <button
                        onClick={handleRemoveDevice}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
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
        </div>
      </AppLayout>
    </AuthWrapper>
  );
}