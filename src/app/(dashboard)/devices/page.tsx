"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  Battery,
  Zap,
  Thermometer,
  Clock,
  Power,
  Wifi,
  WifiOff,
  ArrowRight,
  Settings,
  MoreVertical,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRemainingTime } from "@/lib/data-utils";

interface DeviceData {
  id: string;
  deviceSn: string;
  deviceName: string;
  deviceType?: string;
  isActive: boolean;
  online: boolean;
  status?: string;
  userId: string;
  currentReading?: {
    batteryLevel?: number;
    inputWatts?: number;
    outputWatts?: number;
    temperature?: number;
    remainingTime?: number;
    status?: string;
  };
}

const DevicesPage = () => {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "online" | "offline"
  >("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/devices");
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch devices");
      }

      const data: { devices: DeviceData[]; total: number } =
        await response.json();
      setDevices(data.devices || []);
    } catch (err) {
      console.error("Error fetching devices:", err);
      setError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  };

  // Filter devices based on search and status
  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.deviceSn.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "online" && device.online) ||
      (filterStatus === "offline" && !device.online);

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (online: boolean, batteryLevel?: number) => {
    if (!online) return "text-red-400";
    if (batteryLevel && batteryLevel < 20) return "text-yellow-400";
    return "text-accent-green";
  };

  const getStatusIcon = (online: boolean, batteryLevel?: number) => {
    if (!online) return <WifiOff size={16} className="text-red-400" />;
    if (batteryLevel && batteryLevel < 20)
      return <AlertTriangle size={16} className="text-yellow-400" />;
    return <Wifi size={16} className="text-accent-green" />;
  };

  const getStatusText = (
    online: boolean,
    batteryLevel?: number,
    status?: string
  ) => {
    if (!online) return "Offline";
    if (batteryLevel && batteryLevel < 20) return "Low Battery";
    return status || "Online";
  };

  const DeviceCard = ({ device }: { device: DeviceData }) => {
    const batteryLevel = device.currentReading?.batteryLevel ?? 0;
    const inputWatts = device.currentReading?.inputWatts ?? 0;
    const outputWatts = device.currentReading?.outputWatts ?? 0;
    const temperature = device.currentReading?.temperature ?? 0;
    const remainingTime = device.currentReading?.remainingTime;

    return (
      <div className="bg-primary-dark rounded-lg border border-gray-800 hover:border-accent-green transition-all duration-200 group">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-semibold text-accent-gray group-hover:text-white transition-colors">
                  {device.deviceName}
                </h3>
                {getStatusIcon(device.online, batteryLevel)}
              </div>
              <p className="text-sm text-gray-400">
                {device.deviceSn} • {device.deviceType || "DELTA 2"}
              </p>
              <p
                className={cn(
                  "text-xs font-medium mt-1",
                  getStatusColor(device.online, batteryLevel)
                )}
              >
                {getStatusText(device.online, batteryLevel, device.status)}
              </p>
            </div>
            <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
              <MoreVertical size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Metrics Grid */}
          {device.online && device.currentReading && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Battery */}
              <div className="flex items-center gap-2">
                <Battery
                  size={16}
                  className={cn(
                    batteryLevel > 20 ? "text-accent-green" : "text-yellow-400"
                  )}
                />
                <div>
                  <p className="text-xs text-gray-400">Battery</p>
                  <p className="text-sm font-semibold text-white">
                    {batteryLevel}%
                  </p>
                </div>
              </div>

              {/* Input Power */}
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-blue-400" />
                <div>
                  <p className="text-xs text-gray-400">Input</p>
                  <p className="text-sm font-semibold text-white">
                    {inputWatts}W
                  </p>
                </div>
              </div>

              {/* Output Power */}
              <div className="flex items-center gap-2">
                <Power size={16} className="text-accent-green" />
                <div>
                  <p className="text-xs text-gray-400">Output</p>
                  <p className="text-sm font-semibold text-white">
                    {outputWatts}W
                  </p>
                </div>
              </div>

              {/* Temperature */}
              <div className="flex items-center gap-2">
                <Thermometer size={16} className="text-orange-400" />
                <div>
                  <p className="text-xs text-gray-400">Temp</p>
                  <p className="text-sm font-semibold text-white">
                    {temperature}°C
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Runtime */}
          {device.online && remainingTime && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-gray-900 rounded-md">
              <Clock size={16} className="text-accent-green" />
              <div>
                <p className="text-xs text-gray-400">Estimated Runtime</p>
                <p className="text-sm font-semibold text-white">
                  {formatRemainingTime(remainingTime)}
                </p>
              </div>
            </div>
          )}

          {/* Offline State */}
          {!device.online && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-red-900/20 border border-red-900/30 rounded-md">
              <WifiOff size={16} className="text-red-400" />
              <div>
                <p className="text-sm text-red-400">Device is offline</p>
                <p className="text-xs text-gray-400">Last seen: Unknown</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href={`/device/${device.id}`}
              className="flex-1 bg-accent-green hover:bg-accent-green/90 text-black font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 group"
            >
              View Details
              <ArrowRight
                size={16}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Link>
            <button className="p-2 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors">
              <Settings size={16} className="text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
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
    );
  }

  return (
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
            <Search
              size={20}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            />
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
                  {filterStatus === "all" && "All Devices"}
                  {filterStatus === "online" && "Online Only"}
                  {filterStatus === "offline" && "Offline Only"}
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
                      setFilterStatus("all");
                      setIsFilterOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-white hover:bg-gray-800 transition-colors",
                      filterStatus === "all" &&
                        "bg-accent-green/20 text-accent-green"
                    )}
                  >
                    All Devices
                  </button>
                  <button
                    onClick={() => {
                      setFilterStatus("online");
                      setIsFilterOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-white hover:bg-gray-800 transition-colors",
                      filterStatus === "online" &&
                        "bg-accent-green/20 text-accent-green"
                    )}
                  >
                    Online Only
                  </button>
                  <button
                    onClick={() => {
                      setFilterStatus("offline");
                      setIsFilterOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-white hover:bg-gray-800 transition-colors",
                      filterStatus === "offline" &&
                        "bg-accent-green/20 text-accent-green"
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
                <p className="text-lg font-semibold text-white">
                  {devices.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-primary-dark rounded-lg border border-gray-800 p-4">
            <div className="flex items-center gap-3">
              <Wifi size={20} className="text-accent-green" />
              <div>
                <p className="text-xs text-gray-400">Online</p>
                <p className="text-lg font-semibold text-white">
                  {devices.filter((d) => d.online).length}
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
                  {devices.filter((d) => !d.online).length}
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
            <p className="text-gray-400 text-sm mt-1">{error}</p>
            <button
              onClick={fetchDevices}
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
                  <DeviceCard key={device.id} device={device} />
                ))}

                {/* Add Device Card */}
                <Link
                  href="/devices/add"
                  className="bg-primary-dark rounded-lg border-2 border-dashed border-gray-700 hover:border-accent-green transition-all duration-200 group"
                >
                  <div className="p-6 h-full flex flex-col items-center justify-center text-center min-h-[300px]">
                    <div className="w-16 h-16 bg-gray-800 group-hover:bg-accent-green/20 rounded-full flex items-center justify-center mb-4 transition-colors">
                      <Plus
                        size={32}
                        className="text-gray-400 group-hover:text-accent-green transition-colors"
                      />
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
                {searchTerm || filterStatus !== "all" ? (
                  <div>
                    <Search size={48} className="mx-auto text-gray-600 mb-4" />
                    <h3 className="text-lg font-medium text-gray-400 mb-2">
                      No devices found
                    </h3>
                    <p className="text-gray-500">
                      Try adjusting your search terms or filters
                    </p>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setFilterStatus("all");
                      }}
                      className="mt-4 text-accent-green hover:text-accent-green/80 font-medium transition-colors"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div>
                    <Power size={48} className="mx-auto text-gray-600 mb-4" />
                    <h3 className="text-lg font-medium text-gray-400 mb-2">
                      No devices yet
                    </h3>
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

        {/* Floating Action Button */}
        <Link
          href="/devices/add"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-accent-green hover:bg-accent-green/90 text-black rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
          title="Add Device"
        >
          <Plus
            size={24}
            className="group-hover:scale-110 transition-transform"
          />
        </Link>
      </div>
    </div>
  );
};

export default DevicesPage;
