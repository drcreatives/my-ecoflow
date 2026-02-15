"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDeviceStore } from "@/stores/deviceStore";
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
import { cn } from '@/lib/utils';

// Local interface that matches the actual API response structure
interface EcoFlowDevice {
  sn: string;
  deviceName: string;
  deviceType?: string;
  online: number;
  isRegistered?: boolean;
}

const AddDevicePage = () => {
  const router = useRouter();
  
  // Use store actions for device management
  const { discoverDevices, registerDevice: registerDeviceAction, isLoading: storeLoading } = useDeviceStore();
  
  // Local state for UI and discovered devices
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
      
      // Use store action for device discovery
      const discoveredDevices = await discoverDevices();
      
      // Transform the store response to match the local interface
      const devicesWithRegistrationStatus = discoveredDevices.map(device => ({
        sn: device.deviceSn,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        online: device.onlineStatus ? 1 : 0,
        isRegistered: false // Default to not registered, could check against current devices
      }));
      
      setDevices(devicesWithRegistrationStatus);
    } catch (err) {
      console.error('Error discovering devices:', err);
      setError(err instanceof Error ? err.message : 'Failed to search devices');
    } finally {
      setLoading(false);
    }
  };

  const registerDevice = async (deviceSn: string, deviceName: string) => {
    try {
      setRegistering(deviceSn);
      
      // Use store action for device registration
      await registerDeviceAction(deviceSn, deviceName);

      // Update the local device list to show it's now registered
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
      <div className="bg-surface-1 rounded-card border border-stroke-subtle hover:border-brand-primary/30 shadow-card transition-all duration-160 ease-dashboard p-[18px]">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-medium text-text-primary">
                {device.deviceName}
              </h3>
              {isOnline ? (
                <Wifi size={16} className="text-brand-primary" />
              ) : (
                <WifiOff size={16} className="text-danger" />
              )}
            </div>
            <p className="text-sm text-text-secondary mb-1">
              Serial: {device.sn}
            </p>
            <p className="text-sm text-text-secondary mb-2">
              Type: {device.deviceType || 'DELTA 2'}
            </p>
            <p className={cn(
              "text-xs font-medium",
              isOnline ? "text-brand-primary" : "text-danger"
            )}>
              {isOnline ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>

        {/* Status Messages */}
        {isRegistered && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-success/5 border border-success/15 rounded-inner">
            <CheckCircle size={16} className="text-success" />
            <p className="text-success text-sm font-medium">Device registered successfully!</p>
          </div>
        )}

        {!isOnline && !isRegistered && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-warning/5 border border-warning/15 rounded-inner">
            <AlertTriangle size={16} className="text-warning" />
            <p className="text-warning text-sm">
              Device is offline. You can still register it for future monitoring.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {isRegistered ? (
            <Link 
              href="/devices"
              className="flex-1 bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160 flex items-center justify-center gap-2 text-sm"
            >
              Go to Devices
              <ExternalLink size={16} />
            </Link>
          ) : (
            <button
              onClick={() => registerDevice(device.sn, device.deviceName)}
              disabled={isRegistering}
              className="flex-1 bg-brand-primary hover:bg-brand-secondary disabled:bg-surface-2 disabled:text-text-muted text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160 flex items-center justify-center gap-2 text-sm"
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
    <div className="text-text-primary">
      <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <Link 
                href="/devices"
                className="p-2 hover:bg-surface-2 rounded-inner transition-all duration-160"
              >
                <ArrowLeft size={20} className="text-text-secondary" />
              </Link>
              <div>
                <h1 className="text-page-title text-text-primary font-medium mb-2">Add Device</h1>
                <p className="text-text-secondary">
                  Discover and register your EcoFlow devices
                </p>
              </div>
            </div>

            {/* Info Section */}
            <div className="bg-brand-tertiary/5 border border-brand-tertiary/15 rounded-card p-4 mb-8">
              <div className="flex items-start gap-3">
                <Info size={20} className="text-brand-tertiary mt-0.5" />
                <div>
                  <h3 className="text-brand-tertiary font-medium mb-2">How it works</h3>
                  <ul className="text-text-secondary text-sm space-y-1">
                    <li>• We&apos;ll search for devices associated with your EcoFlow account</li>
                    <li>• Select devices you want to monitor in this dashboard</li>
                    <li>• Registered devices will appear in your devices list</li>
                    <li>• You can monitor both online and offline devices</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Search Section */}
            <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-[18px] mb-8">
              <h2 className="text-section-title font-medium text-text-primary mb-4">Discover Devices</h2>
              <p className="text-text-secondary mb-6">
                Search for EcoFlow devices associated with your account.
              </p>
              
              <button
                onClick={searchDevices}
                disabled={loading}
                className="bg-brand-primary hover:bg-brand-secondary disabled:bg-surface-2 disabled:text-text-muted text-bg-base font-medium py-3 px-6 rounded-pill transition-all duration-160 flex items-center gap-3 text-sm"
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
              <div className="bg-danger/5 border border-danger/15 rounded-card p-4 mb-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} className="text-danger" />
                  <p className="text-danger font-medium">Error discovering devices</p>
                </div>
                <p className="text-text-secondary text-sm mt-1">{error}</p>
                <button
                  onClick={searchDevices}
                  className="mt-3 text-brand-primary hover:text-brand-secondary text-sm font-medium transition-all duration-160"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Results */}
            {searchPerformed && !loading && !error && (
              <div>
                <h2 className="text-section-title font-medium text-text-primary mb-6">
                  Discovered Devices ({devices.length})
                </h2>
                
                {devices.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[18px]">
                    {devices.map((device) => (
                      <DeviceDiscoveryCard key={device.sn} device={device} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Search size={48} className="mx-auto text-text-muted mb-4" />
                    <h3 className="text-lg font-medium text-text-secondary mb-2">No devices found</h3>
                    <p className="text-text-muted mb-6">
                      Make sure your devices are connected to your EcoFlow account
                    </p>
                    <div className="space-y-2 text-sm text-text-secondary">
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
              <div className="mt-8 bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-[18px]">
                <h3 className="text-section-title font-medium text-text-primary mb-3">Manual Device Entry</h3>
                <p className="text-text-secondary mb-4">
                  If your device isn&apos;t appearing in the search results, you can manually add it by serial number.
                </p>
                <button 
                  className="bg-surface-2 hover:bg-surface-2/80 text-text-primary font-medium py-2 px-4 rounded-pill border border-stroke-subtle transition-all duration-160 text-sm"
                  onClick={() => alert('Manual entry feature coming soon!')}
                >
                  Add Manually
                </button>
              </div>
            )}
          </div>
        </div>
  );
};

export default AddDevicePage;