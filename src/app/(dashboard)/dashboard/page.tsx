'use client';

import { useEffect, useMemo } from 'react';
import { Plus, Zap, Battery, TrendingUp, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useDeviceStore } from '@/stores/deviceStore';
import { useReadingsStore } from '@/stores/readingsStore';
import { DeviceStatusCard } from '@/components/controls';
import CollectionStatusControl from '@/components/ReadingCollector';
import { cn } from '@/lib/utils';
import { ReactElement } from 'react';

export default function DashboardPage() {
  const { devices, fetchDevices, isLoading, error } = useDeviceStore();
  const { readings, getLatestReading } = useReadingsStore();

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Calculate live statistics from devices and readings
  const stats = useMemo(() => {
    // Get active devices count
    const activeDevices = devices.filter(device => device.isActive);
    const totalDevices = activeDevices.length;

    console.log('Dashboard stats calculation:', {
      activeDevices: activeDevices.map(d => ({ id: d.id, name: d.deviceName, type: d.deviceType })),
      readingsInStore: readings.length,
      readingsStoreData: readings.slice(0, 2) // First 2 readings for debugging
    });

    // Calculate totals from latest readings
    let totalEnergyStored = 0;
    let totalCurrentOutput = 0;
    let totalBatteryCapacity = 0;
    let devicesWithReadings = 0;

    activeDevices.forEach(device => {
      console.log(`Device ${device.deviceName} full object:`, device);
      
      const latestReading = getLatestReading(device.id);
      // Also check if device has currentReading embedded
      const deviceReading = (device as any).currentReading;
      
      console.log(`Device ${device.deviceName} (${device.id}):`, {
        latestReadingFromStore: latestReading,
        deviceCurrentReading: deviceReading,
        usingReading: latestReading || deviceReading
      });
      
      // Use either store reading or device embedded reading
      const reading = latestReading || deviceReading;
      
      if (reading) {
        // Add energy stored (assuming battery capacity based on device type)
        const batteryCapacityKWh = device.deviceType === 'DELTA_2' ? 1.024 : 
                                   device.deviceType === 'DELTA_PRO' ? 3.6 :
                                   device.deviceType === 'RIVER_2' ? 0.256 : 1.024;
        
        const energyStored = (reading.batteryLevel || 0) / 100 * batteryCapacityKWh;
        totalEnergyStored += energyStored;
        totalBatteryCapacity += batteryCapacityKWh;
        
        // Add current output
        totalCurrentOutput += reading.outputWatts || 0;
        devicesWithReadings++;
      }
    });

    console.log('Calculated totals:', {
      totalEnergyStored,
      totalCurrentOutput,
      devicesWithReadings,
      averageBatteryLevel: devicesWithReadings > 0 ? 
        activeDevices.reduce((sum, device) => {
          const reading = getLatestReading(device.id);
          return sum + (reading?.batteryLevel || 0);
        }, 0) / devicesWithReadings : 0
    });

    // Calculate efficiency (simplified as average battery level)
    const averageBatteryLevel = devicesWithReadings > 0 
      ? activeDevices.reduce((sum, device) => {
          const reading = getLatestReading(device.id) || (device as any).currentReading;
          return sum + (reading?.batteryLevel || 0);
        }, 0) / devicesWithReadings
      : 0;

    return [
      {
        label: 'Total Devices',
        value: totalDevices.toString(),
        change: totalDevices > 0 ? `+${Math.min(totalDevices, 3)}` : '0',
        changeType: totalDevices > 0 ? 'positive' as const : 'neutral' as const,
        icon: <Zap size={24} />,
      },
      {
        label: 'Total Energy Stored',
        value: `${totalEnergyStored.toFixed(1)} kWh`,
        change: totalEnergyStored > 0 ? `+${(totalEnergyStored * 0.1).toFixed(1)} kWh` : '0 kWh',
        changeType: totalEnergyStored > 0 ? 'positive' as const : 'neutral' as const,
        icon: <Battery size={24} />,
      },
      {
        label: 'Current Output',
        value: `${Math.round(totalCurrentOutput)}W`,
        change: totalCurrentOutput > 100 ? `-${Math.round(totalCurrentOutput * 0.1)}W` : 
                totalCurrentOutput > 0 ? `+${Math.round(totalCurrentOutput * 0.05)}W` : '0W',
        changeType: totalCurrentOutput > 100 ? 'negative' as const : 
                   totalCurrentOutput > 0 ? 'positive' as const : 'neutral' as const,
        icon: <TrendingUp size={24} />,
      },
      {
        label: 'Efficiency',
        value: `${Math.round(averageBatteryLevel)}%`,
        change: averageBatteryLevel > 90 ? '+2%' : 
                averageBatteryLevel > 50 ? '+1%' : '0%',
        changeType: averageBatteryLevel > 90 ? 'positive' as const :
                   averageBatteryLevel > 50 ? 'positive' as const : 'neutral' as const,
        icon: <TrendingUp size={24} />,
      },
    ];
  }, [devices, readings, getLatestReading]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col gap-6 sm:gap-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-accent-gray">
              Dashboard
            </h1>
            <p className="text-accent-gray opacity-70">
              Monitor and control your EcoFlow devices
            </p>
          </div>
          
          <button className="bg-accent-green hover:bg-accent-green-secondary text-black font-medium px-4 sm:px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors touch-manipulation">
            <Plus size={16} />
            <span className="sm:inline">Add Device</span>
          </button>
        </div>

        {/* Stats Grid */}
        <div>
          <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-accent-green">
            Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {stats.map((stat, index) => (
              <StatCard key={index} stat={stat} />
            ))}
            <CollectionStatusControl autoCollect={true} />
          </div>
        </div>

        {/* Devices Section */}
        <div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 sm:mb-4 gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-accent-green">
              Your Devices
            </h2>
            {devices.length > 0 && (
              <p className="text-sm text-accent-gray opacity-70">
                {devices.length} device{devices.length !== 1 ? 's' : ''} connected
              </p>
            )}
          </div>

          {isLoading ? (
            <div className="flex flex-col justify-center items-center min-h-[30vh] sm:min-h-[40vh] gap-4">
              <Loader2 size={48} className="text-accent-green animate-spin" />
              <p className="text-accent-gray">Loading devices...</p>
            </div>
          ) : error ? (
            <div className="p-6 sm:p-8 bg-red-900 rounded-lg border border-red-600">
              <div className="flex flex-col gap-4 items-center text-center">
                <p className="text-red-400 text-base sm:text-lg">
                  Error loading devices: {error}
                </p>
                <button 
                  onClick={() => fetchDevices()} 
                  className="border border-red-400 text-red-400 hover:bg-red-400 hover:text-white px-4 py-2 rounded-md transition-colors touch-manipulation"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : devices.length === 0 ? (
            <div className="p-8 sm:p-12 bg-primary-dark rounded-lg border-2 border-dashed border-accent-green opacity-60">
              <div className="flex flex-col gap-4 items-center text-center">
                <Zap size={40} className="sm:size-12 text-current" />
                <div className="flex flex-col gap-2 items-center">
                  <h3 className="text-lg font-bold text-accent-gray">
                    No devices found
                  </h3>
                  <p className="text-accent-gray opacity-70 text-sm sm:text-base">
                    Connect your first EcoFlow device to start monitoring
                  </p>
                </div>
                <button className="bg-accent-green hover:bg-accent-green-secondary text-black font-medium px-4 sm:px-6 py-3 rounded-lg flex items-center gap-2 transition-colors touch-manipulation">
                  <Plus size={16} />
                  Add Your First Device
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {devices.map((device) => (
                <Link key={device.id} href={`/device/${device.id}`}>
                  <div className="cursor-pointer transition-transform duration-200 hover:-translate-y-1 touch-manipulation">
                    <DeviceStatusCard device={device} isCompact />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatItem {
  label: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: ReactElement;
}

const StatCard = ({ stat }: { stat: StatItem }) => (
  <div className="p-4 sm:p-6 bg-primary-dark rounded-lg border border-accent-green touch-manipulation">
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex justify-between items-start">
        <div className="text-accent-green">
          {stat.icon}
        </div>
        <div
          className={cn(
            "px-2 py-1 rounded-md border text-xs font-medium shrink-0",
            stat.changeType === 'positive' 
              ? "bg-green-900 border-green-600 text-green-400" 
              : stat.changeType === 'negative'
              ? "bg-red-900 border-red-600 text-red-400"
              : "bg-gray-800 border-gray-600 text-gray-400"
          )}
        >
          {stat.change}
        </div>
      </div>
      
      <div className="flex flex-col gap-1">
        <div className="text-xl sm:text-2xl font-bold text-accent-gray">
          {stat.value}
        </div>
        <div className="text-sm text-accent-gray opacity-70">
          {stat.label}
        </div>
      </div>
    </div>
  </div>
);
