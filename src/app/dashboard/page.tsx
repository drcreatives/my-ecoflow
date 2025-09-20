'use client'

import { Box, SimpleGrid, Text, Stack } from '@chakra-ui/react'
import { AppLayout } from '@/components/layout'
import { useDeviceStore } from '@/stores/deviceStore'
import { useAuthStore } from '@/stores/authStore'
import { useEffect } from 'react'

const DashboardPage = () => {
  const { devices, fetchDevices } = useDeviceStore()
  const { user } = useAuthStore()

  useEffect(() => {
    // Fetch devices when component mounts
    fetchDevices()
  }, [fetchDevices])

  return (
    <AppLayout title="Dashboard">
      <Stack direction="column" gap={8} align="stretch">
        {/* Welcome Section */}
        <Box>
          <Text fontSize="3xl" fontWeight="bold" color="accent.gray" mb={2}>
            Welcome to EcoFlow Dashboard
          </Text>
          <Text fontSize="lg" color="gray.400">
            Monitor and control your EcoFlow power stations
          </Text>
        </Box>

        {/* Stats Grid */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={6}>
          <Box
            bg="primary.dark"
            p={6}
            borderRadius="lg"
            border="1px"
            borderColor="gray.700"
          >
            <Text fontSize="sm" color="gray.400" mb={2}>
              Total Devices
            </Text>
            <Text fontSize="3xl" fontWeight="bold" color="accent.green">
              {devices.length}
            </Text>
          </Box>
          
          <Box
            bg="primary.dark"
            p={6}
            borderRadius="lg"
            border="1px"
            borderColor="gray.700"
          >
            <Text fontSize="sm" color="gray.400" mb={2}>
              Active Devices
            </Text>
            <Text fontSize="3xl" fontWeight="bold" color="accent.green">
              {devices.filter(d => d.isActive).length}
            </Text>
          </Box>
          
          <Box
            bg="primary.dark"
            p={6}
            borderRadius="lg"
            border="1px"
            borderColor="gray.700"
          >
            <Text fontSize="sm" color="gray.400" mb={2}>
              Total Power
            </Text>
            <Text fontSize="3xl" fontWeight="bold" color="accent.blue">
              1,250W
            </Text>
          </Box>
          
          <Box
            bg="primary.dark"
            p={6}
            borderRadius="lg"
            border="1px"
            borderColor="gray.700"
          >
            <Text fontSize="sm" color="gray.400" mb={2}>
              Efficiency
            </Text>
            <Text fontSize="3xl" fontWeight="bold" color="accent.greenLight">
              94%
            </Text>
          </Box>
        </SimpleGrid>

        {/* Placeholder for future dashboard content */}
        <Box
          bg="primary.dark"
          p={8}
          borderRadius="lg"
          border="1px"
          borderColor="gray.700"
          textAlign="center"
        >
          <Text fontSize="lg" color="gray.400" mb={4}>
            Dashboard components will be added in the next phase
          </Text>
          <Text fontSize="sm" color="gray.500">
            This includes real-time charts, device controls, and energy analytics
          </Text>
        </Box>
      </Stack>
    </AppLayout>
  )
}

export default DashboardPage