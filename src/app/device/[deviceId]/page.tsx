'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Box,
  VStack,
  HStack,
  Text,
  SimpleGrid,
  Spinner,
  Button,
} from '@chakra-ui/react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useDeviceStore } from '@/stores/deviceStore';
import { DeviceControlPanel, DeviceStatusCard } from '@/components/controls';
import { AppLayout } from '@/components/layout';
import { DeviceReading } from '@/lib/data-utils';

export default function DeviceDetailPage() {
  const params = useParams();
  const deviceId = params?.deviceId as string;
  
  const { 
    devices, 
    fetchDevices, 
    refreshDevice, 
    isLoading,
    error 
  } = useDeviceStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deviceReading, setDeviceReading] = useState<DeviceReading | undefined>(undefined);

  // Find the current device
  const device = devices.find(d => d.id === deviceId);

  useEffect(() => {
    if (!devices.length) {
      fetchDevices();
    }
  }, [devices.length, fetchDevices]);

  const handleRefresh = async () => {
    if (!device) return;
    
    setIsRefreshing(true);
    try {
      await refreshDevice(device.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <VStack gap={4}>
            <Spinner size="xl" color="accent.green" />
            <Text color="accent.gray">Loading device details...</Text>
          </VStack>
        </Box>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <Box p={8}>
          <VStack gap={4} align="center">
            <Text color="red.400" fontSize="lg">
              Error: {error}
            </Text>
            <Button onClick={() => fetchDevices()} colorScheme="green">
              Try Again
            </Button>
          </VStack>
        </Box>
      </AppLayout>
    );
  }

  if (!device) {
    return (
      <AppLayout>
        <Box p={8}>
          <VStack gap={4} align="center">
            <Text color="accent.gray" fontSize="lg">
              Device not found
            </Text>
            <Link href="/dashboard">
              <Button colorScheme="green">
                Back to Dashboard
              </Button>
            </Link>
          </VStack>
        </Box>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Box p={6}>
        <VStack gap={6} align="stretch">
          {/* Header */}
          <HStack justify="space-between">
            <HStack gap={4}>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" colorScheme="gray">
                  <ArrowLeft size={16} />
                  Back to Dashboard
                </Button>
              </Link>
              <VStack align="start" gap={1}>
                <Text fontSize="2xl" fontWeight="bold" color="accent.gray">
                  {device.deviceName || 'Unnamed Device'}
                </Text>
                <Text fontSize="sm" color="accent.gray" opacity={0.7}>
                  Device Details & Controls
                </Text>
              </VStack>
            </HStack>
            
            <Button 
              onClick={handleRefresh}
              loading={isRefreshing}
              colorScheme="green"
              variant="outline"
            >
              <RefreshCw size={16} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </HStack>

          {/* Main Content Grid */}
          <SimpleGrid columns={{ base: 1, xl: 2 }} gap={6}>
            {/* Device Status Card */}
            <DeviceStatusCard 
              device={device}
              deviceReading={deviceReading}
            />
            
            {/* Device Control Panel */}
            <DeviceControlPanel 
              device={device}
              deviceReading={deviceReading}
            />
          </SimpleGrid>
          
          {/* Additional Info Section */}
          <Box p={6} bg="primary.dark" borderRadius="lg" border="1px solid" borderColor="accent.green">
            <VStack gap={4} align="stretch">
              <Text fontSize="lg" fontWeight="bold" color="accent.green">
                Device Information
              </Text>
              
              <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={4}>
                <Box>
                  <Text fontSize="sm" color="accent.gray" opacity={0.7}>
                    Serial Number
                  </Text>
                  <Text fontWeight="medium" color="accent.gray">
                    {device.deviceSn}
                  </Text>
                </Box>
                
                <Box>
                  <Text fontSize="sm" color="accent.gray" opacity={0.7}>
                    Device Type
                  </Text>
                  <Text fontWeight="medium" color="accent.gray">
                    {device.deviceType}
                  </Text>
                </Box>
                
                <Box>
                  <Text fontSize="sm" color="accent.gray" opacity={0.7}>
                    Status
                  </Text>
                  <Text fontWeight="medium" color={device.isActive ? 'accent.green' : 'red.400'}>
                    {device.isActive ? 'Active' : 'Inactive'}
                  </Text>
                </Box>
                
                <Box>
                  <Text fontSize="sm" color="accent.gray" opacity={0.7}>
                    Added Date
                  </Text>
                  <Text fontWeight="medium" color="accent.gray">
                    {device.createdAt ? new Date(device.createdAt).toLocaleDateString() : 'Unknown'}
                  </Text>
                </Box>
              </SimpleGrid>
            </VStack>
          </Box>
        </VStack>
      </Box>
    </AppLayout>
  );
}