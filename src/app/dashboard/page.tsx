'use client';

import { useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  SimpleGrid,
  Button,
  Spinner,
} from '@chakra-ui/react';
import { Plus, Zap, Battery, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useDeviceStore } from '@/stores/deviceStore';
import { DeviceStatusCard } from '@/components/controls';
import { AppLayout } from '@/components/layout';
import AuthWrapper from '@/components/AuthWrapper';

// Mock stats for demo purposes
const stats = [
  {
    label: 'Total Devices',
    value: '3',
    change: '+1',
    changeType: 'positive',
    icon: <Zap size={24} />,
  },
  {
    label: 'Total Energy Stored',
    value: '2.4 kWh',
    change: '+0.3 kWh',
    changeType: 'positive',
    icon: <Battery size={24} />,
  },
  {
    label: 'Current Output',
    value: '450W',
    change: '-50W',
    changeType: 'negative',
    icon: <TrendingUp size={24} />,
  },
  {
    label: 'Efficiency',
    value: '94%',
    change: '+2%',
    changeType: 'positive',
    icon: <TrendingUp size={24} />,
  },
];

const StatCard = ({ stat }: { stat: typeof stats[0] }) => (
  <Box p={6} bg="primary.dark" borderRadius="lg" border="1px solid" borderColor="accent.green">
    <VStack gap={4} align="stretch">
      <HStack justify="space-between">
        <Box color="accent.green">
          {stat.icon}
        </Box>
        <Box
          px={2}
          py={1}
          borderRadius="md"
          bg={stat.changeType === 'positive' ? 'green.900' : 'red.900'}
          border="1px solid"
          borderColor={stat.changeType === 'positive' ? 'green.600' : 'red.600'}
        >
          <Text
            fontSize="xs"
            color={stat.changeType === 'positive' ? 'green.400' : 'red.400'}
            fontWeight="medium"
          >
            {stat.change}
          </Text>
        </Box>
      </HStack>
      
      <VStack align="start" gap={1}>
        <Text fontSize="2xl" fontWeight="bold" color="accent.gray">
          {stat.value}
        </Text>
        <Text fontSize="sm" color="accent.gray" opacity={0.7}>
          {stat.label}
        </Text>
      </VStack>
    </VStack>
  </Box>
);

function Dashboard() {
  const { devices, fetchDevices, isLoading, error } = useDeviceStore();

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return (
    <AppLayout>
      <Box p={6}>
        <VStack gap={8} align="stretch">
          {/* Header */}
          <HStack justify="space-between">
            <VStack align="start" gap={1}>
              <Text fontSize="3xl" fontWeight="bold" color="accent.gray">
                Dashboard
              </Text>
              <Text color="accent.gray" opacity={0.7}>
                Monitor and control your EcoFlow devices
              </Text>
            </VStack>
            
            <Button
              colorScheme="green"
              size="lg"
            >
              <Plus size={16} />
              Add Device
            </Button>
          </HStack>

          {/* Stats Grid */}
          <Box>
            <Text fontSize="xl" fontWeight="bold" mb={4} color="accent.green">
              Overview
            </Text>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={4}>
              {stats.map((stat, index) => (
                <StatCard key={index} stat={stat} />
              ))}
            </SimpleGrid>
          </Box>

          {/* Devices Section */}
          <Box>
            <HStack justify="space-between" mb={4}>
              <Text fontSize="xl" fontWeight="bold" color="accent.green">
                Your Devices
              </Text>
              {devices.length > 0 && (
                <Text fontSize="sm" color="accent.gray" opacity={0.7}>
                  {devices.length} device{devices.length !== 1 ? 's' : ''} connected
                </Text>
              )}
            </HStack>

            {isLoading ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
                <VStack gap={4}>
                  <Spinner size="xl" color="accent.green" />
                  <Text color="accent.gray">Loading devices...</Text>
                </VStack>
              </Box>
            ) : error ? (
              <Box p={8} bg="red.900" borderRadius="lg" border="1px solid" borderColor="red.600">
                <VStack gap={4} align="center">
                  <Text color="red.400" fontSize="lg">
                    Error loading devices: {error}
                  </Text>
                  <Button onClick={() => fetchDevices()} colorScheme="red" variant="outline">
                    Try Again
                  </Button>
                </VStack>
              </Box>
            ) : devices.length === 0 ? (
              <Box 
                p={12} 
                bg="primary.dark" 
                borderRadius="lg" 
                border="2px dashed" 
                borderColor="accent.green"
                opacity={0.6}
              >
                <VStack gap={4} align="center">
                  <Zap size={48} color="currentColor" />
                  <VStack gap={2} align="center">
                    <Text fontSize="lg" fontWeight="bold" color="accent.gray">
                      No devices found
                    </Text>
                    <Text color="accent.gray" opacity={0.7} textAlign="center">
                      Connect your first EcoFlow device to start monitoring
                    </Text>
                  </VStack>
                  <Button colorScheme="green" size="lg">
                    <Plus size={16} />
                    Add Your First Device
                  </Button>
                </VStack>
              </Box>
            ) : (
              <SimpleGrid columns={{ base: 1, lg: 2, xl: 3 }} gap={6}>
                {devices.map((device) => (
                  <Link key={device.id} href={`/device/${device.id}`}>
                    <Box
                      cursor="pointer"
                      transition="transform 0.2s"
                      _hover={{ transform: 'translateY(-4px)' }}
                    >
                      <DeviceStatusCard device={device} isCompact />
                    </Box>
                  </Link>
                ))}
              </SimpleGrid>
            )}
          </Box>
        </VStack>
      </Box>
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