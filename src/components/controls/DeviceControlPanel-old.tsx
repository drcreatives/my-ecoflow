'use client';

import { FC, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  SimpleGrid,
  Badge,
} from '@chakra-ui/react';
import { 
  Power, 
  Battery, 
  Zap, 
  Sun, 
  Wind, 
  Car,
  Home,
  Lightbulb,
  Settings,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { DeviceData, DeviceReading, DeviceCommands } from '@/lib/data-utils';
import { useDeviceStore } from '@/stores/deviceStore';

interface DeviceControlPanelProps {
  device: DeviceData;
  deviceReading?: DeviceReading;
  isCompact?: boolean;
}

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  variant?: 'primary' | 'secondary' | 'warning' | 'danger';
}

const ControlButton: FC<ControlButtonProps> = ({
  icon,
  label,
  description,
  onClick,
  isLoading = false,
  isDisabled = false,
  variant = 'secondary',
}) => {
  const getColorScheme = () => {
    switch (variant) {
      case 'primary': return 'green';
      case 'warning': return 'orange';
      case 'danger': return 'red';
      default: return 'gray';
    }
  };

  return (
    <Button
      onClick={onClick}
      loading={isLoading}
      disabled={isDisabled}
      size="lg"
      colorScheme={getColorScheme()}
      variant="outline"
      height="auto"
      p={4}
      flexDirection="column"
      gap={2}
      _hover={{
        transform: 'translateY(-2px)',
        boxShadow: 'lg',
      }}
      transition="all 0.2s"
    >
      <Box fontSize="2xl" color="accent.green">
        {icon}
      </Box>
      <VStack gap={1}>
        <Text fontWeight="bold" fontSize="sm">
          {label}
        </Text>
        <Text fontSize="xs" opacity={0.8} textAlign="center">
          {description}
        </Text>
      </VStack>
    </Button>
  );
};

export const DeviceControlPanel: FC<DeviceControlPanelProps> = ({
  device,
  deviceReading,
  isCompact = false,
}) => {
  const { controlDevice, refreshDevice } = useDeviceStore();
  const [loadingCommands, setLoadingCommands] = useState<Set<string>>(new Set());

  const showToast = (title: string, description: string, status: 'success' | 'error') => {
    // Simple toast implementation - could be enhanced with a proper toast library
    console.log(`${status.toUpperCase()}: ${title} - ${description}`);
  };

  const handleCommand = async (commandType: string, enabled?: boolean) => {
    setLoadingCommands(prev => new Set(prev).add(commandType));
    
    try {
      let command;
      switch (commandType) {
        case 'AC_OUTPUT':
          command = DeviceCommands.toggleACOutput(enabled ?? true);
          break;
        case 'DC_OUTPUT':
          command = DeviceCommands.toggleDCOutput(enabled ?? true);
          break;
        case 'USB_OUTPUT':
          command = DeviceCommands.toggleUSBOutput(enabled ?? true);
          break;
        case 'REFRESH':
          await refreshDevice(device.id);
          showToast('Status Updated', `Refreshed data for ${device.deviceName}`, 'success');
          return;
        default:
          throw new Error('Unknown command type');
      }

      await controlDevice(device.id, command);
      showToast('Command Sent', `Successfully sent ${commandType} command to ${device.deviceName}`, 'success');
    } catch (error: any) {
      showToast('Command Failed', error.message || 'Failed to send command', 'error');
    } finally {
      setLoadingCommands(prev => {
        const newSet = new Set(prev);
        newSet.delete(commandType);
        return newSet;
      });
    }
  };

  const isCommandLoading = (command: string) => loadingCommands.has(command);

  // Device status indicators
  const getBatteryColor = (level?: number) => {
    if (!level) return 'gray';
    if (level > 60) return 'green';
    if (level > 30) return 'orange';
    return 'red';
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

  const batteryLevel = deviceReading?.batteryLevel ?? 0;
  const deviceStatus = deviceReading?.status ?? 'offline';

  if (isCompact) {
    return (
      <Box p={4} bg="primary.dark" borderRadius="md" border="1px solid" borderColor="accent.green">
        <VStack gap={3}>
          <HStack justify="space-between" width="full">
            <Text fontWeight="bold" color="accent.gray">
              Quick Controls
            </Text>
            <Badge colorScheme={getStatusColor(deviceStatus)} variant="outline">
              {deviceStatus}
            </Badge>
          </HStack>
          
          <SimpleGrid columns={2} gap={2} width="full">
            <ControlButton
              icon={<Power />}
              label="AC On"
              description="Enable AC output"
              onClick={() => handleCommand('AC_OUTPUT', true)}
              isLoading={isCommandLoading('AC_OUTPUT')}
              variant="primary"
            />
            <ControlButton
              icon={<Power />}
              label="AC Off"
              description="Disable AC output"
              onClick={() => handleCommand('AC_OUTPUT', false)}
              isLoading={isCommandLoading('AC_OUTPUT')}
              variant="danger"
            />
          </SimpleGrid>
        </VStack>
      </Box>
    );
  }

  return (
    <Box p={6} bg="primary.dark" borderRadius="lg" border="1px solid" borderColor="accent.green">
      <VStack gap={6} align="stretch">
        {/* Header */}
        <HStack justify="space-between">
          <VStack align="start" gap={1}>
            <Text fontSize="xl" fontWeight="bold" color="accent.gray">
              Device Controls
            </Text>
            <Text fontSize="sm" color="accent.gray" opacity={0.7}>
              {device.deviceName || 'Unnamed Device'} • SN: {device.deviceSn}
            </Text>
          </VStack>
          <VStack align="end" gap={1}>
            <Badge colorScheme={getStatusColor(deviceStatus)} variant="outline" fontSize="sm">
              {deviceStatus}
            </Badge>
            <HStack gap={2}>
              <Battery size={16} />
              <Text fontSize="sm" color={`${getBatteryColor(batteryLevel)}.400`}>
                {batteryLevel}%
              </Text>
            </HStack>
          </VStack>
        </HStack>

        {/* Battery Status */}
        <Box>
          <HStack justify="space-between" mb={2}>
            <Text fontSize="sm" fontWeight="medium" color="accent.gray">
              Battery Level
            </Text>
            <Text fontSize="sm" color="accent.gray">
              {batteryLevel}%
            </Text>
          </HStack>
          <Box
            width="full"
            height={3}
            bg="gray.700"
            borderRadius="md"
            overflow="hidden"
          >
            <Box
              width={`${batteryLevel}%`}
              height="full"
              bg={`${getBatteryColor(batteryLevel)}.400`}
              transition="width 0.3s ease"
            />
          </Box>
        </Box>

        {/* Power Management */}
        <Box>
          <Text fontSize="lg" fontWeight="bold" mb={4} color="accent.green">
            Power Management
          </Text>
          <SimpleGrid columns={{ base: 2, md: 3 }} gap={4}>
            <ControlButton
              icon={<Power />}
              label="AC Output On"
              description="Enable AC power output"
              onClick={() => handleCommand('AC_OUTPUT', true)}
              isLoading={isCommandLoading('AC_OUTPUT')}
              variant="primary"
            />
            <ControlButton
              icon={<Power />}
              label="AC Output Off"
              description="Disable AC power output"
              onClick={() => handleCommand('AC_OUTPUT', false)}
              isLoading={isCommandLoading('AC_OUTPUT')}
              variant="danger"
            />
            <ControlButton
              icon={<Zap />}
              label="DC Output On"
              description="Enable DC power output"
              onClick={() => handleCommand('DC_OUTPUT', true)}
              isLoading={isCommandLoading('DC_OUTPUT')}
              variant="primary"
            />
            <ControlButton
              icon={<Zap />}
              label="DC Output Off"
              description="Disable DC power output"
              onClick={() => handleCommand('DC_OUTPUT', false)}
              isLoading={isCommandLoading('DC_OUTPUT')}
              variant="danger"
            />
            <ControlButton
              icon={<Car />}
              label="USB Output On"
              description="Enable USB charging ports"
              onClick={() => handleCommand('USB_OUTPUT', true)}
              isLoading={isCommandLoading('USB_OUTPUT')}
              variant="primary"
            />
            <ControlButton
              icon={<Car />}
              label="USB Output Off"
              description="Disable USB charging ports"
              onClick={() => handleCommand('USB_OUTPUT', false)}
              isLoading={isCommandLoading('USB_OUTPUT')}
              variant="danger"
            />
          </SimpleGrid>
        </Box>

        {/* Device Settings */}
        <Box>
          <Text fontSize="lg" fontWeight="bold" mb={4} color="accent.green">
            Device Settings
          </Text>
          <SimpleGrid columns={{ base: 2, md: 3 }} gap={4}>
            <ControlButton
              icon={<RefreshCw />}
              label="Refresh Status"
              description="Update device data"
              onClick={() => handleCommand('REFRESH')}
              isLoading={isCommandLoading('REFRESH')}
            />
            <ControlButton
              icon={<Settings />}
              label="Advanced Settings"
              description="Configure device options"
              onClick={() => {}} // Placeholder
              isDisabled={true}
            />
            <ControlButton
              icon={<Lightbulb />}
              label="LCD Brightness"
              description="Adjust display brightness"
              onClick={() => {}} // Placeholder
              isDisabled={true}
            />
          </SimpleGrid>
        </Box>

        {/* Warning for offline devices */}
        {deviceStatus === 'offline' && (
          <Box
            bg="orange.50"
            border="1px solid"
            borderColor="orange.200"
            borderRadius="md"
            p={4}
          >
            <HStack gap={3}>
              <AlertTriangle size={16} color="orange" />
              <Text fontSize="sm" color="orange.700">
                Device is offline. Commands may not be executed until the device comes online.
              </Text>
            </HStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default DeviceControlPanel;