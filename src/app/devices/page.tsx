'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Plus, 
  Search, 
  Filter, 
  Power,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { AppLayout } from '@/components/layout';
import AuthWrapper from '@/components/AuthWrapper';
import { useDevices, useLatestReadings } from '@/hooks/useDevices';
import { DeviceStatusCard } from '@/components/controls';
import { cn } from '@/lib/utils';
import { formatRemainingTime } from '@/lib/data-utils';
import { Device } from '@/types';

const DevicesPage = () => {
  const router = useRouter();
  const { data: devices = [], isLoading: loading, error, refetch } = useDevices();
  const { data: latestReadings = [] } = useLatestReadings();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Create a map for quick lookup of latest readings by device ID
  const readingsMap = latestReadings.reduce((acc, reading) => {
    acc[reading.deviceId] = reading;
    return acc;
  }, {} as Record<string, any>);

  // Filter devices based on search and status
  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.deviceName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.deviceSn.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'online' && device.online) ||
                         (filterStatus === 'offline' && !device.online);
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <AuthWrapper>
        <AppLayout>
          <div className="min-h-screen bg-primary-black text-accent-gray">
            <div className="container mx-auto px-4 py-8">
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 size={32} className="animate-spin text-accent-green" />
                  <p className="text-gray-400">Loading devices...</p>
                </div>
              </div>
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
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">My Devices</h1>
                <p className="text-gray-400">
                  Manage and monitor your EcoFlow devices
                </p>
              </div>
              
              <div className="flex gap-3">
                <Link
                  href="/devices/add"
                  className="bg-accent-green hover:bg-accent-green/90 text-black font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Plus size={16} />
                  Add Device
                </Link>
              </div>
            </div>

            {/* Filters and Search */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              {/* Search */}
              <div className="relative flex-1">
                <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search devices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-primary-dark border border-gray-700 rounded-lg focus:border-accent-green focus:outline-none text-white placeholder-gray-400"
                />
              </div>

              {/* Status Filter */}
              <div className="relative">
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-gray-400" />
                  <button
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="bg-primary-dark border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-accent-green focus:outline-none hover:border-gray-600 transition-colors flex items-center gap-2 min-w-[140px] justify-between"
                  >
                    <span>
                      {filterStatus === 'all' && 'All Devices'}
                      {filterStatus === 'online' && 'Online Only'}
                      {filterStatus === 'offline' && 'Offline Only'}
                    </span>
                    <ChevronDown 
                      size={16} 
                      className={cn(
                        "text-gray-400 transition-transform",
                        isFilterOpen && "rotate-180"
                      )} 
                    />
                  </button>
                </div>
                
                {/* Custom Dropdown */}
                {isFilterOpen && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsFilterOpen(false)}
                    />
                    {/* Dropdown Menu */}
                    <div className="absolute top-full left-6 mt-1 w-40 bg-primary-dark border border-gray-700 rounded-lg shadow-lg z-20 overflow-hidden">
                      <button
                        onClick={() => {
                          setFilterStatus('all');
                          setIsFilterOpen(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-white hover:bg-gray-800 transition-colors",
                          filterStatus === 'all' && "bg-accent-green/20 text-accent-green"
                        )}
                      >
                        All Devices
                      </button>
                      <button
                        onClick={() => {
                          setFilterStatus('online');
                          setIsFilterOpen(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-white hover:bg-gray-800 transition-colors",
                          filterStatus === 'online' && "bg-accent-green/20 text-accent-green"
                        )}
                      >
                        Online Only
                      </button>
                      <button
                        onClick={() => {
                          setFilterStatus('offline');
                          setIsFilterOpen(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-white hover:bg-gray-800 transition-colors",
                          filterStatus === 'offline' && "bg-accent-green/20 text-accent-green"
                        )}
                      >
                        Offline Only
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-primary-dark rounded-lg border border-gray-800 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle size={20} className="text-accent-green" />
                  <div>
                    <p className="text-xs text-gray-400">Total Devices</p>
                    <p className="text-lg font-semibold text-white">{devices.length}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-primary-dark rounded-lg border border-gray-800 p-4">
                <div className="flex items-center gap-3">
                  <Wifi size={20} className="text-accent-green" />
                  <div>
                    <p className="text-xs text-gray-400">Online</p>
                    <p className="text-lg font-semibold text-white">
                      {devices.filter(d => d.online).length}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-primary-dark rounded-lg border border-gray-800 p-4">
                <div className="flex items-center gap-3">
                  <WifiOff size={20} className="text-red-400" />
                  <div>
                    <p className="text-xs text-gray-400">Offline</p>
                    <p className="text-lg font-semibold text-white">
                      {devices.filter(d => !d.online).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2">
                  <XCircle size={20} className="text-red-400" />
                  <p className="text-red-400 font-medium">Error loading devices</p>
                </div>
                <p className="text-gray-400 text-sm mt-1">{error?.message || 'Unknown error'}</p>
                <button
                  onClick={() => refetch()}
                  className="mt-3 text-accent-green hover:text-accent-green/80 text-sm font-medium transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Devices Grid */}
            {!error && (
              <>
                {filteredDevices.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredDevices.map((device) => (
                      <Link key={device.id} href={`/device/${device.id}`}>
                        <div className="cursor-pointer transition-transform duration-200 hover:-translate-y-1">
                          <DeviceStatusCard 
                            device={{
                              ...device,
                              online: device.online, // Use the correct online field
                              currentReading: device.currentReading || {
                                batteryLevel: 0,
                                inputWatts: 0,
                                outputWatts: 0,
                                temperature: 20,
                                remainingTime: null,
                                status: 'offline'
                              }
                            }} 
                          />
                        </div>
                      </Link>
                    ))}
                    
                    {/* Add Device Card */}
                    <Link 
                      href="/devices/add"
                      className="bg-primary-dark rounded-lg border-2 border-dashed border-gray-700 hover:border-accent-green transition-all duration-200 group"
                    >
                      <div className="p-6 h-full flex flex-col items-center justify-center text-center min-h-[300px]">
                        <div className="w-16 h-16 bg-gray-800 group-hover:bg-accent-green/20 rounded-full flex items-center justify-center mb-4 transition-colors">
                          <Plus size={32} className="text-gray-400 group-hover:text-accent-green transition-colors" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-400 group-hover:text-white transition-colors mb-2">
                          Add Another Device
                        </h3>
                        <p className="text-sm text-gray-500 group-hover:text-gray-300 transition-colors mb-4">
                          Connect more EcoFlow devices to your dashboard
                        </p>
                        <div className="bg-accent-green hover:bg-accent-green/90 text-black font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2">
                          <Plus size={16} />
                          Add Device
                        </div>
                      </div>
                    </Link>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    {searchTerm || filterStatus !== 'all' ? (
                      <div>
                        <Search size={48} className="mx-auto text-gray-600 mb-4" />
                        <h3 className="text-lg font-medium text-gray-400 mb-2">No devices found</h3>
                        <p className="text-gray-500">
                          Try adjusting your search terms or filters
                        </p>
                        <button
                          onClick={() => {
                            setSearchTerm('');
                            setFilterStatus('all');
                          }}
                          className="mt-4 text-accent-green hover:text-accent-green/80 font-medium transition-colors"
                        >
                          Clear filters
                        </button>
                      </div>
                    ) : (
                      <div>
                        <Power size={48} className="mx-auto text-gray-600 mb-4" />
                        <h3 className="text-lg font-medium text-gray-400 mb-2">No devices yet</h3>
                        <p className="text-gray-500 mb-6">
                          Add your first EcoFlow device to get started
                        </p>
                        <Link
                          href="/devices/add"
                          className="inline-flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 text-black font-medium py-2 px-6 rounded-lg transition-colors"
                        >
                          <Plus size={16} />
                          Add Your First Device
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Floating Action Button */}
        <Link
          href="/devices/add"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-accent-green hover:bg-accent-green/90 text-black rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
          title="Add Device"
        >
          <Plus size={24} className="group-hover:scale-110 transition-transform" />
        </Link>
      </AppLayout>
    </AuthWrapper>
  );
};

export default DevicesPage;