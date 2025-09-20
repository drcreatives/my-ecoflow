'use client';

import { FC } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  SimpleGrid,
} from '@chakra-ui/react';
import { 
  Battery, 
  Zap, 
  Thermometer,
  Clock,
  Power,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { DeviceData, DeviceReading } from '@/lib/data-utils';

interface DeviceStatusCardProps {
  device: DeviceData;
  deviceReading?: DeviceReading;
  isCompact?: boolean;
}

interface StatusMetricProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  trend?: 'up' | 'down' | 'stable';
}

const StatusMetric: FC<StatusMetricProps> = ({
  icon,
  label,
  value,
  unit,
  color = 'accent.gray',
  trend,
}) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return <TrendingUp size={12} color="green" />;
      case 'down': return <TrendingDown size={12} color="red" />;
      default: return null;
    }
  };

  return (
    <VStack gap={2} align="center" p={3} bg="primary.black" borderRadius="md">
      <Box color={color} fontSize="lg">
        {icon}
      </Box>
      <VStack gap={0} align="center">
        <HStack gap={1}>
          <Text fontSize="xl" fontWeight="bold" color={color}>
            {value}
          </Text>
          {unit && (
            <Text fontSize="sm" color="accent.gray" opacity={0.7}>
              {unit}
            </Text>
          )}
          {getTrendIcon()}
        </HStack>
        <Text fontSize="xs" color="accent.gray" opacity={0.6} textAlign="center">
          {label}
        </Text>
      </VStack>
    </VStack>
  );
};

export const DeviceStatusCard: FC<DeviceStatusCardProps> = ({
  device,
  deviceReading,
  isCompact = false,
}) => {
  const formatTime = (minutes?: number) => {
    if (!minutes) return '--';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatWatts = (watts?: number) => {
    if (!watts) return '0';
    if (watts >= 1000) return `${(watts / 1000).toFixed(1)}k`;
    return watts.toString();
  };

  const getStatusColor = (status?: string) => {
    if (!status) return 'gray';
    switch (status.toLowerCase()) {
      case 'online': return 'green';
      case 'charging': return 'blue';
      case 'discharging': return 'orange';
      default: return 'gray';
    }
  };

  const getBatteryColor = (level?: number) => {
    if (!level) return 'gray';
    if (level > 60) return 'green';
    if (level > 30) return 'orange';
    return 'red';
  };

  const deviceStatus = deviceReading?.status ?? 'offline';
  const batteryLevel = deviceReading?.batteryLevel ?? 0;
  const inputWatts = deviceReading?.inputWatts ?? 0;
  const outputWatts = deviceReading?.outputWatts ?? 0;
  const temperature = deviceReading?.temperature ?? 0;
  const remainingTime = deviceReading?.remainingTime;

  if (isCompact) {
    return (
      <Box p={4} bg="primary.dark" borderRadius="md" border="1px solid" borderColor="accent.green">
        <VStack gap={3}>
          <HStack justify="space-between" width="full">
            <VStack align="start" gap={1}>
              <Text fontWeight="bold" color="accent.gray" fontSize="sm">
                {device.deviceName || 'Unnamed Device'}
              </Text>
              <Text fontSize="xs" color="accent.gray" opacity={0.6}>
                {device.deviceSn}
              </Text>
            </VStack>
            <Badge colorScheme={getStatusColor(deviceStatus)} variant="outline" fontSize="xs">
              {deviceStatus}
            </Badge>
          </HStack>

          <SimpleGrid columns={2} gap={2} width="full">
            <StatusMetric
              icon={<Battery />}
              label="Battery"
              value={batteryLevel}
              unit="%"
              color={`${getBatteryColor(batteryLevel)}.400`}
            />
            <StatusMetric
              icon={<Zap />}
              label="Output"
              value={formatWatts(outputWatts)}
              unit="W"
              color="accent.blue"
            />
          </SimpleGrid>
        </VStack>
      </Box>
    );
  }

  return (
    <Box p={6} bg="primary.dark" borderRadius="lg" border="1px solid" borderColor="accent.green">
      <VStack gap={4} align="stretch">
        {/* Header */}
        <HStack justify="space-between">
          <VStack align="start" gap={1}>
            <Text fontSize="lg" fontWeight="bold" color="accent.gray">
              {device.deviceName || 'Unnamed Device'}
            </Text>
            <Text fontSize="sm" color="accent.gray" opacity={0.7}>
              {device.deviceSn} • {device.deviceType}
            </Text>
          </VStack>
          <Badge colorScheme={getStatusColor(deviceStatus)} variant="outline" fontSize="sm">
            {deviceStatus}
          </Badge>
        </HStack>

        {/* Status Metrics Grid */}
        <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={3}>
          <StatusMetric
            icon={<Battery />}
            label="Battery Level"
            value={batteryLevel}
            unit="%"
            color={`${getBatteryColor(batteryLevel)}.400`}
          />
          <StatusMetric
            icon={<Power />}
            label="Input Power"
            value={formatWatts(inputWatts)}
            unit="W"
            color="accent.green"
            trend={inputWatts > 0 ? 'up' : 'stable'}
          />
          <StatusMetric
            icon={<Zap />}
            label="Output Power"
            value={formatWatts(outputWatts)}
            unit="W"
            color="accent.blue"
            trend={outputWatts > 0 ? 'down' : 'stable'}
          />
          <StatusMetric
            icon={<Thermometer />}
            label="Temperature"
            value={temperature}
            unit="°C"
            color={temperature > 40 ? 'orange.400' : 'accent.gray'}
          />
        </SimpleGrid>

        {/* Additional Info */}
        {remainingTime && (
          <Box p={3} bg="primary.black" borderRadius="md">
            <HStack gap={2}>
              <Clock size={16} color="currentColor" />
              <VStack align="start" gap={0}>
                <Text fontSize="sm" fontWeight="medium" color="accent.gray">
                  Estimated Runtime
                </Text>
                <Text fontSize="lg" fontWeight="bold" color="accent.green">
                  {formatTime(remainingTime)}
                </Text>
              </VStack>
            </HStack>
          </Box>
        )}

        {/* Last Updated */}
        <Text fontSize="xs" color="accent.gray" opacity={0.5} textAlign="center">
          Last updated: {deviceReading?.recordedAt ? new Date(deviceReading.recordedAt).toLocaleTimeString() : 'Never'}
        </Text>
      </VStack>
    </Box>
  );
};

export default DeviceStatusCard;