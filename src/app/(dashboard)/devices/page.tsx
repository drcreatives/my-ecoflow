"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConvexDevices } from "@/hooks/useConvexData";
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
import { formatRemainingTime, DeviceData } from "@/lib/data-utils";

const DevicesPage = () => {
  const router = useRouter();
  
  // Use Convex reactive query for devices
  const { devices, isLoading: loading, error } = useConvexDevices();
  
  // Keep local UI state for search and filtering
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "online" | "offline"
  >("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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
    if (!online) return "text-danger";
    if (batteryLevel && batteryLevel < 20) return "text-warning";
    return "text-brand-primary";
  };

  const getStatusIcon = (online: boolean, batteryLevel?: number) => {
    if (!online) return <WifiOff size={16} className="text-danger" />;
    if (batteryLevel && batteryLevel < 20)
      return <AlertTriangle size={16} className="text-warning" />;
    return <Wifi size={16} className="text-brand-primary" />;
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
      <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card hover:shadow-card-hover hover:border-stroke-strong transition-all duration-160 ease-dashboard group">
        <div className="p-[18px]">
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-medium text-text-primary group-hover:text-white transition-colors">
                  {device.deviceName}
                </h3>
                {getStatusIcon(device.online, batteryLevel)}
              </div>
              <p className="text-sm text-text-secondary">
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
            <button className="p-2 hover:bg-surface-2 rounded-inner transition-all duration-160 opacity-0 group-hover:opacity-100">
              <MoreVertical size={16} className="text-icon" />
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
                    batteryLevel > 20 ? "text-brand-primary" : "text-warning"
                  )}
                />
                <div>
                  <p className="text-xs text-text-muted">Battery</p>
                  <p className="text-sm font-medium text-text-primary">
                    {batteryLevel}%
                  </p>
                </div>
              </div>

              {/* Input Power */}
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-brand-tertiary" />
                <div>
                  <p className="text-xs text-text-muted">Input</p>
                  <p className="text-sm font-medium text-text-primary">
                    {inputWatts}W
                  </p>
                </div>
              </div>

              {/* Output Power */}
              <div className="flex items-center gap-2">
                <Power size={16} className="text-brand-primary" />
                <div>
                  <p className="text-xs text-text-muted">Output</p>
                  <p className="text-sm font-medium text-text-primary">
                    {outputWatts}W
                  </p>
                </div>
              </div>

              {/* Temperature */}
              <div className="flex items-center gap-2">
                <Thermometer size={16} className="text-warning" />
                <div>
                  <p className="text-xs text-text-muted">Temp</p>
                  <p className="text-sm font-medium text-text-primary">
                    {temperature}°C
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Runtime */}
          {device.online && remainingTime && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-surface-2 rounded-inner">
              <Clock size={16} className="text-brand-primary" />
              <div>
                <p className="text-xs text-text-muted">Estimated Runtime</p>
                <p className="text-sm font-medium text-text-primary">
                  {formatRemainingTime(remainingTime)}
                </p>
              </div>
            </div>
          )}

          {/* Offline State */}
          {!device.online && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-danger/5 border border-danger/15 rounded-inner">
              <WifiOff size={16} className="text-danger" />
              <div>
                <p className="text-sm text-danger">Device is offline</p>
                <p className="text-xs text-text-muted">Last seen: Unknown</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href={`/device/${device.id}`}
              className="flex-1 bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160 flex items-center justify-center gap-2 text-sm group"
            >
              View Details
              <ArrowRight
                size={16}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Link>
            <Link href={`/device/${device.id}/settings`} className="flex items-center p-2 border border-stroke-subtle hover:border-stroke-strong rounded-inner transition-all duration-160">
              <Settings size={16} className="text-icon" />
            </Link>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="animate-spin text-brand-primary" />
              <p className="text-text-secondary">Loading devices...</p>
            </div>
          </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-page-title font-medium text-text-primary mb-2">My Devices</h1>
            <p className="text-text-secondary">
              Manage and monitor your EcoFlow devices
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/devices/add"
              className="bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160 flex items-center gap-2 text-sm"
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
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-2 border border-stroke-subtle rounded-inner focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 focus:outline-none text-text-primary placeholder-text-muted"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-text-muted" />
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:border-brand-primary focus:outline-none hover:border-stroke-strong transition-all duration-160 flex items-center gap-2 min-w-[140px] justify-between"
              >
                <span>
                  {filterStatus === "all" && "All Devices"}
                  {filterStatus === "online" && "Online Only"}
                  {filterStatus === "offline" && "Offline Only"}
                </span>
                <ChevronDown
                  size={16}
                  className={cn(
                    "text-text-muted transition-transform",
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
                <div className="absolute top-full left-6 mt-1 w-40 bg-surface-2 border border-stroke-subtle rounded-inner shadow-card z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      setFilterStatus("all");
                      setIsFilterOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-text-primary hover:bg-surface-1 transition-all duration-160",
                      filterStatus === "all" &&
                        "bg-brand-primary/10 text-brand-primary"
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
                      "w-full px-3 py-2 text-left text-text-primary hover:bg-surface-1 transition-all duration-160",
                      filterStatus === "online" &&
                        "bg-brand-primary/10 text-brand-primary"
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
                      "w-full px-3 py-2 text-left text-text-primary hover:bg-surface-1 transition-all duration-160",
                      filterStatus === "offline" &&
                        "bg-brand-primary/10 text-brand-primary"
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px] mb-8">
          <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-4">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-brand-primary" />
              <div>
                <p className="text-xs text-text-muted">Total Devices</p>
                <p className="text-lg font-medium text-text-primary">
                  {devices.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-4">
            <div className="flex items-center gap-3">
              <Wifi size={20} className="text-brand-primary" />
              <div>
                <p className="text-xs text-text-muted">Online</p>
                <p className="text-lg font-medium text-text-primary">
                  {devices.filter((d) => d.online).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-1 rounded-card border border-stroke-subtle shadow-card p-4">
            <div className="flex items-center gap-3">
              <WifiOff size={20} className="text-danger" />
              <div>
                <p className="text-xs text-text-muted">Offline</p>
                <p className="text-lg font-medium text-text-primary">
                  {devices.filter((d) => !d.online).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-danger/5 border border-danger/15 rounded-card p-4 mb-6">
            <div className="flex items-center gap-2">
              <XCircle size={20} className="text-danger" />
              <p className="text-danger font-medium">Error loading devices</p>
            </div>
            <p className="text-text-secondary text-sm mt-1">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 text-brand-primary hover:text-brand-secondary text-sm font-medium transition-all duration-160"
            >
              Try again
            </button>
          </div>
        )}

        {/* Devices Grid */}
        {!error && (
          <>
            {filteredDevices.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[18px]">
                {filteredDevices.map((device) => (
                  <DeviceCard key={device.id} device={device} />
                ))}

                {/* Add Device Card */}
                <Link
                  href="/devices/add"
                  className="bg-surface-1 rounded-card border-2 border-dashed border-stroke-subtle hover:border-brand-primary/40 transition-all duration-160 ease-dashboard group"
                >
                  <div className="p-[18px] h-full flex flex-col items-center justify-center text-center min-h-[300px]">
                    <div className="w-16 h-16 bg-surface-2 group-hover:bg-brand-primary/10 rounded-full flex items-center justify-center mb-4 transition-all duration-160">
                      <Plus
                        size={32}
                        className="text-text-muted group-hover:text-brand-primary transition-colors"
                      />
                    </div>
                    <h3 className="text-lg font-medium text-text-secondary group-hover:text-text-primary transition-colors mb-2">
                      Add Another Device
                    </h3>
                    <p className="text-sm text-text-muted group-hover:text-text-secondary transition-colors mb-4">
                      Connect more EcoFlow devices to your dashboard
                    </p>
                    <div className="bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160 flex items-center gap-2 text-sm">
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
                    <Search size={48} className="mx-auto text-text-muted mb-4" />
                    <h3 className="text-lg font-medium text-text-secondary mb-2">
                      No devices found
                    </h3>
                    <p className="text-text-muted">
                      Try adjusting your search terms or filters
                    </p>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setFilterStatus("all");
                      }}
                      className="mt-4 text-brand-primary hover:text-brand-secondary font-medium transition-all duration-160"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div>
                    <Power size={48} className="mx-auto text-text-muted mb-4" />
                    <h3 className="text-lg font-medium text-text-secondary mb-2">
                      No devices yet
                    </h3>
                    <p className="text-text-muted mb-6">
                      Add your first EcoFlow device to get started
                    </p>
                    <Link
                      href="/devices/add"
                      className="inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-2 px-6 rounded-pill transition-all duration-160 text-sm"
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
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-brand-primary hover:bg-brand-secondary text-bg-base rounded-full shadow-card hover:shadow-card-hover transition-all duration-160 ease-dashboard flex items-center justify-center"
          title="Add Device"
        >
          <Plus size={24} />
        </Link>
    </div>
  );
};

export default DevicesPage;
