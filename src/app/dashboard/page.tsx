'use client';

import { useEffect } from 'react';
import { Plus, Zap, Battery, TrendingUp, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useDeviceStore } from '@/stores/deviceStore';
import { DeviceStatusCard } from '@/components/controls';
import { AppLayout } from '@/components/layout';
import AuthWrapper from '@/components/AuthWrapper';
import { cn } from '@/lib/utils';

// Mock stats for demo purposes
const stats = [
  {
    label: 'Total Devices',
    value: '3',
    change: '+1',
    changeType: 'positive' as const,
    icon: <Zap size={24} />,
  },
  {
    label: 'Total Energy Stored',
    value: '2.4 kWh',
    change: '+0.3 kWh',
    changeType: 'positive' as const,
    icon: <Battery size={24} />,
  },
  {
    label: 'Current Output',
    value: '450W',
    change: '-50W',
    changeType: 'negative' as const,
    icon: <TrendingUp size={24} />,
  },
  {
    label: 'Efficiency',
    value: '94%',
    change: '+2%',
    changeType: 'positive' as const,
    icon: <TrendingUp size={24} />,
  },
];

const StatCard = ({ stat }: { stat: typeof stats[0] }) => (
  <div className="p-6 bg-primary-dark rounded-lg border border-accent-green">
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div className="text-accent-green">
          {stat.icon}
        </div>
        <div
          className={cn(
            "px-2 py-1 rounded-md border text-xs font-medium",
            stat.changeType === 'positive' 
              ? "bg-green-900 border-green-600 text-green-400" 
              : "bg-red-900 border-red-600 text-red-400"
          )}
        >
          {stat.change}
        </div>
      </div>
      
      <div className="flex flex-col gap-1">
        <div className="text-2xl font-bold text-accent-gray">
          {stat.value}
        </div>
        <div className="text-sm text-accent-gray opacity-70">
          {stat.label}
        </div>
      </div>
    </div>
  </div>
);

function Dashboard() {
  const { devices, fetchDevices, isLoading, error } = useDeviceStore();

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex flex-col gap-8">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-bold text-accent-gray">
                Dashboard
              </h1>
              <p className="text-accent-gray opacity-70">
                Monitor and control your EcoFlow devices
              </p>
            </div>
            
            <button className="bg-accent-green hover:bg-accent-green-secondary text-black font-medium px-6 py-3 rounded-lg flex items-center gap-2 transition-colors">
              <Plus size={16} />
              Add Device
            </button>
          </div>

          {/* Stats Grid */}
          <div>
            <h2 className="text-xl font-bold mb-4 text-accent-green">
              Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((stat, index) => (
                <StatCard key={index} stat={stat} />
              ))}
            </div>
          </div>

          {/* Devices Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-accent-green">
                Your Devices
              </h2>
              {devices.length > 0 && (
                <p className="text-sm text-accent-gray opacity-70">
                  {devices.length} device{devices.length !== 1 ? 's' : ''} connected
                </p>
              )}
            </div>

            {isLoading ? (
              <div className="flex flex-col justify-center items-center min-h-[40vh] gap-4">
                <Loader2 size={48} className="text-accent-green animate-spin" />
                <p className="text-accent-gray">Loading devices...</p>
              </div>
            ) : error ? (
              <div className="p-8 bg-red-900 rounded-lg border border-red-600">
                <div className="flex flex-col gap-4 items-center">
                  <p className="text-red-400 text-lg text-center">
                    Error loading devices: {error}
                  </p>
                  <button 
                    onClick={() => fetchDevices()} 
                    className="border border-red-400 text-red-400 hover:bg-red-400 hover:text-white px-4 py-2 rounded-md transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            ) : devices.length === 0 ? (
              <div className="p-12 bg-primary-dark rounded-lg border-2 border-dashed border-accent-green opacity-60">
                <div className="flex flex-col gap-4 items-center">
                  <Zap size={48} className="text-current" />
                  <div className="flex flex-col gap-2 items-center">
                    <h3 className="text-lg font-bold text-accent-gray">
                      No devices found
                    </h3>
                    <p className="text-accent-gray opacity-70 text-center">
                      Connect your first EcoFlow device to start monitoring
                    </p>
                  </div>
                  <button className="bg-accent-green hover:bg-accent-green-secondary text-black font-medium px-6 py-3 rounded-lg flex items-center gap-2 transition-colors">
                    <Plus size={16} />
                    Add Your First Device
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {devices.map((device) => (
                  <Link key={device.id} href={`/device/${device.id}`}>
                    <div className="cursor-pointer transition-transform duration-200 hover:-translate-y-1">
                      <DeviceStatusCard device={device} isCompact />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// Wrap the dashboard with authentication
export default function DashboardPage() {
  return (
    <AuthWrapper>
      <Dashboard />
    </AuthWrapper>
  );
}