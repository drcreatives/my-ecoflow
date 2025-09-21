'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  Wifi, 
  WifiOff, 
  CheckCircle, 
  AlertTriangle,
  Loader2,
  Info,
  ExternalLink
} from 'lucide-react';
import { AppLayout } from '@/components/layout';
import AuthWrapper from '@/components/AuthWrapper';
import { cn } from '@/lib/utils';

interface EcoFlowDevice {
  sn: string;
  deviceName: string;
  deviceType?: string;
  online: number;
  isRegistered?: boolean;
}

const AddDevicePage = () => {
  const router = useRouter();
  const [devices, setDevices] = useState<EcoFlowDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const searchDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      setSearchPerformed(true);
      
      const response = await fetch('/api/devices');
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch devices');
      }
      
      const data: { devices: EcoFlowDevice[], total: number } = await response.json();
      setDevices(data.devices || []);
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError(err instanceof Error ? err.message : 'Failed to search devices');
    } finally {
      setLoading(false);
    }
  };

  const registerDevice = async (deviceSn: string, deviceName: string) => {
    try {
      setRegistering(deviceSn);
      
      const response = await fetch('/api/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceSn,
          deviceName,
          deviceType: 'DELTA_2'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to register device');
      }

      // Update the device list to show it's now registered
      setDevices(prev => prev.map(device => 
        device.sn === deviceSn 
          ? { ...device, isRegistered: true }
          : device
      ));

      // Redirect to devices page after successful registration
      setTimeout(() => {
        router.push('/devices');
      }, 1500);
      
    } catch (err) {
      console.error('Error registering device:', err);
      alert(err instanceof Error ? err.message : 'Failed to register device');
    } finally {
      setRegistering(null);
    }
  };

  const DeviceDiscoveryCard = ({ device }: { device: EcoFlowDevice }) => {
    const isOnline = device.online === 1;
    const isRegistering = registering === device.sn;
    const isRegistered = device.isRegistered;

    return (
      <div className="bg-primary-dark rounded-lg border border-gray-800 hover:border-accent-green/50 transition-all duration-200 p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-white">
                {device.deviceName}
              </h3>
              {isOnline ? (
                <Wifi size={16} className="text-accent-green" />
              ) : (
                <WifiOff size={16} className="text-red-400" />
              )}
            </div>
            <p className="text-sm text-gray-400 mb-1">
              Serial: {device.sn}
            </p>
            <p className="text-sm text-gray-400 mb-2">
              Type: {device.deviceType || 'DELTA 2'}
            </p>
            <p className={cn(
              "text-xs font-medium",
              isOnline ? "text-accent-green" : "text-red-400"
            )}>
              {isOnline ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>

        {/* Status Messages */}
        {isRegistered && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-green-900/20 border border-green-900/30 rounded-md">
            <CheckCircle size={16} className="text-green-400" />
            <p className="text-green-400 text-sm font-medium">Device registered successfully!</p>
          </div>
        )}

        {!isOnline && !isRegistered && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-yellow-900/20 border border-yellow-900/30 rounded-md">
            <AlertTriangle size={16} className="text-yellow-400" />
            <p className="text-yellow-400 text-sm">
              Device is offline. You can still register it for future monitoring.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {isRegistered ? (
            <Link 
              href="/devices"
              className="flex-1 bg-accent-green hover:bg-accent-green/90 text-black font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Go to Devices
              <ExternalLink size={16} />
            </Link>
          ) : (
            <button
              onClick={() => registerDevice(device.sn, device.deviceName)}
              disabled={isRegistering}
              className="flex-1 bg-accent-green hover:bg-accent-green/90 disabled:bg-gray-700 disabled:text-gray-400 text-black font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isRegistering ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Register Device
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <AuthWrapper>
      <AppLayout>
        <div className="min-h-screen bg-primary-black text-accent-gray">
          <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <Link 
                href="/devices"
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} className="text-gray-400" />
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Add Device</h1>
                <p className="text-gray-400">
                  Discover and register your EcoFlow devices
                </p>
              </div>
            </div>

            {/* Info Section */}
            <div className="bg-blue-900/20 border border-blue-900/30 rounded-lg p-4 mb-8">
              <div className="flex items-start gap-3">
                <Info size={20} className="text-blue-400 mt-0.5" />
                <div>
                  <h3 className="text-blue-400 font-medium mb-2">How it works</h3>
                  <ul className="text-gray-300 text-sm space-y-1">
                    <li>• We'll search for devices associated with your EcoFlow account</li>
                    <li>• Select devices you want to monitor in this dashboard</li>
                    <li>• Registered devices will appear in your devices list</li>
                    <li>• You can monitor both online and offline devices</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Search Section */}
            <div className="bg-primary-dark rounded-lg border border-gray-800 p-6 mb-8">
              <h2 className="text-xl font-semibold text-white mb-4">Discover Devices</h2>
              <p className="text-gray-400 mb-6">
                Search for EcoFlow devices associated with your account.
              </p>
              
              <button
                onClick={searchDevices}
                disabled={loading}
                className="bg-accent-green hover:bg-accent-green/90 disabled:bg-gray-700 disabled:text-gray-400 text-black font-medium py-3 px-6 rounded-lg transition-colors flex items-center gap-3"
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Searching for devices...
                  </>
                ) : (
                  <>
                    <Search size={20} />
                    Search for Devices
                  </>
                )}
              </button>
            </div>

            {/* Error State */}
            {error && (
              <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} className="text-red-400" />
                  <p className="text-red-400 font-medium">Error discovering devices</p>
                </div>
                <p className="text-gray-400 text-sm mt-1">{error}</p>
                <button
                  onClick={searchDevices}
                  className="mt-3 text-accent-green hover:text-accent-green/80 text-sm font-medium transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Results */}
            {searchPerformed && !loading && !error && (
              <div>
                <h2 className="text-xl font-semibold text-white mb-6">
                  Discovered Devices ({devices.length})
                </h2>
                
                {devices.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {devices.map((device) => (
                      <DeviceDiscoveryCard key={device.sn} device={device} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Search size={48} className="mx-auto text-gray-600 mb-4" />
                    <h3 className="text-lg font-medium text-gray-400 mb-2">No devices found</h3>
                    <p className="text-gray-500 mb-6">
                      Make sure your devices are connected to your EcoFlow account
                    </p>
                    <div className="space-y-2 text-sm text-gray-400">
                      <p>• Check your EcoFlow app to ensure devices are properly connected</p>
                      <p>• Verify your account credentials are correct</p>
                      <p>• Try searching again in a few moments</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Manual Entry Option */}
            {searchPerformed && devices.length === 0 && !loading && (
              <div className="mt-8 bg-primary-dark rounded-lg border border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-3">Manual Device Entry</h3>
                <p className="text-gray-400 mb-4">
                  If your device isn't appearing in the search results, you can manually add it by serial number.
                </p>
                <button 
                  className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  onClick={() => alert('Manual entry feature coming soon!')}
                >
                  Add Manually
                </button>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    </AuthWrapper>
  );
};

export default AddDevicePage;