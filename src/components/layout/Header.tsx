'use client'

import {
  Box,
  Flex,
  Text,
  Button,
  Stack,
  Badge,
  useBreakpointValue,
} from '@chakra-ui/react'
import {
  Bell,
  Menu,
  Power,
  Wifi,
  WifiOff,
  Battery,
  Settings,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useDeviceStore } from '@/stores/deviceStore'
import LogoutButton from '@/components/LogoutButton'

interface HeaderProps {
  title?: string
}

export const Header = ({ title }: HeaderProps) => {
  const { user } = useAuthStore()
  const { notifications, toggleSidebar } = useUIStore()
  const { devices } = useDeviceStore()
  const isMobile = useBreakpointValue({ base: true, lg: false })

  const unreadNotifications = notifications.filter(n => !n.isRead).length
  const activeDevices = devices.filter(d => d.isActive).length
  const totalDevices = devices.length

  // Mock connection status for now
  const isOnline = true

  return (
    <Box
      bg="primary.dark"
      borderBottom="1px"
      borderColor="gray.700"
      px={6}
      py={4}
      position="sticky"
      top={0}
      zIndex={100}
    >
      <Flex alignItems="center" justify="space-between">
        {/* Left side */}
        <Flex alignItems="center" gap={4}>
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              color="accent.gray"
            >
              <Menu size={20} />
            </Button>
          )}
          
          <Stack gap={1}>
            <Text
              fontSize="xl"
              fontWeight="bold"
              color="accent.gray"
            >
              {title || 'Dashboard'}
            </Text>
            <Text fontSize="sm" color="gray.400">
              Welcome back, {user?.email?.split('@')[0]}
            </Text>
          </Stack>
        </Flex>

        {/* Right side */}
        <Flex alignItems="center" gap={4}>
          {/* Device Status */}
          <Flex alignItems="center" gap={2}>
            <Box
              w={2}
              h={2}
              borderRadius="full"
              bg={isOnline ? 'accent.green' : 'red.400'}
            />
            <Text fontSize="sm" color="accent.gray">
              {activeDevices}/{totalDevices} devices active
            </Text>
          </Flex>

          {/* Connection Status */}
          <Flex alignItems="center" gap={2}>
            {isOnline ? (
              <Wifi size={16} color="var(--chakra-colors-accent-green)" />
            ) : (
              <WifiOff size={16} color="var(--chakra-colors-red-400)" />
            )}
            <Text fontSize="sm" color={isOnline ? 'accent.green' : 'red.400'}>
              {isOnline ? 'Connected' : 'Offline'}
            </Text>
          </Flex>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="sm"
            position="relative"
            color="accent.gray"
            _hover={{ bg: 'gray.700' }}
          >
            <Bell size={20} />
            {unreadNotifications > 0 && (
              <Badge
                position="absolute"
                top="-1"
                right="-1"
                bg="accent.green"
                color="white"
                borderRadius="full"
                fontSize="xs"
                minW={5}
                h={5}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </Badge>
            )}
          </Button>

          {/* Settings */}
          <Button
            variant="ghost"
            size="sm"
            color="accent.gray"
            _hover={{ bg: 'gray.700' }}
          >
            <Settings size={20} />
          </Button>

          {/* Logout Button */}
          <LogoutButton />
        </Flex>
      </Flex>
    </Box>
  )
}