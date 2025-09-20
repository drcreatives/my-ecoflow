'use client'

import {
  Box,
  Stack,
  Text,
  Button,
  useBreakpointValue,
  Flex,
} from '@chakra-ui/react'
import {
  Home,
  Battery,
  BarChart3,
  Settings,
  Power,
  LogOut,
  Menu,
  Zap,
  TrendingUp,
  Bell,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'

interface SidebarProps {
  onClose?: () => void
}

const navigationItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    description: 'Overview of all devices'
  },
  {
    label: 'Devices',
    href: '/devices',
    icon: Battery,
    description: 'Manage your power stations'
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    description: 'Energy usage insights'
  },
  {
    label: 'History',
    href: '/history',
    icon: TrendingUp,
    description: 'Historical data'
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'App preferences'
  },
]

const SidebarContent = ({ onClose }: SidebarProps) => {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  
  const handleLogout = async () => {
    try {
      await logout()
      onClose?.()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <Box h="full" bg="primary.dark" borderRight="1px" borderColor="gray.700" w="280px">
      {/* Header */}
      <Flex h="16" alignItems="center" mx="4" justify="space-between">
        <Flex alignItems="center" gap={3}>
          <Box
            w={8}
            h={8}
            bg="accent.green"
            borderRadius="md"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Zap size={20} color="white" />
          </Box>
          <Text fontSize="lg" fontWeight="bold" color="accent.gray">
            EcoFlow
          </Text>
        </Flex>
      </Flex>

      {/* Divider */}
      <Box h="1px" bg="gray.700" mx={4} />

      {/* Navigation */}
      <Stack gap={1} mt={4} px={3}>
        {navigationItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link key={item.href} href={item.href} onClick={onClose}>
              <Button
                variant="ghost"
                justifyContent="flex-start"
                bg={isActive ? 'accent.green' : 'transparent'}
                color={isActive ? 'white' : 'accent.gray'}
                _hover={{
                  bg: isActive ? 'accent.greenSecondary' : 'gray.700',
                }}
                borderRadius="md"
                h={12}
                fontWeight="medium"
                w="full"
                gap={3}
              >
                <Icon size={20} />
                <Stack gap={0} flex={1} alignItems="flex-start">
                  <Text fontSize="sm">{item.label}</Text>
                  <Text fontSize="xs" opacity={0.7}>
                    {item.description}
                  </Text>
                </Stack>
              </Button>
            </Link>
          )
        })}
      </Stack>

      {/* User Profile & Logout */}
      <Box position="absolute" bottom={0} left={0} right={0} p={4}>
        <Box h="1px" bg="gray.700" mb={4} />
        
        {user && (
          <Flex gap={3} mb={3} alignItems="center">
            <Box
              w={8}
              h={8}
              bg="accent.green"
              borderRadius="full"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontSize="sm"
              fontWeight="bold"
              color="white"
            >
              {user.email?.[0]?.toUpperCase()}
            </Box>
            <Stack gap={0} flex={1}>
              <Text fontSize="sm" fontWeight="medium" color="accent.gray">
                {user.email}
              </Text>
              <Text fontSize="xs" color="gray.400">
                Online
              </Text>
            </Stack>
          </Flex>
        )}

        <Button
          variant="ghost"
          onClick={handleLogout}
          w="full"
          justifyContent="flex-start"
          color="gray.400"
          _hover={{ color: 'accent.gray', bg: 'gray.700' }}
          gap={3}
        >
          <LogOut size={20} />
          Sign Out
        </Button>
      </Box>
    </Box>
  )
}

export const Sidebar = () => {
  const pathname = usePathname()
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const isMobile = useBreakpointValue({ base: true, lg: false })

  if (isMobile) {
    return (
      <Box>
        <Button
          onClick={toggleSidebar}
          variant="ghost"
          size="sm"
          position="fixed"
          top={4}
          left={4}
          zIndex={1001}
          bg="primary.dark"
          border="1px"
          borderColor="gray.700"
          gap={2}
        >
          <Menu size={20} />
          Menu
        </Button>
        
        {sidebarOpen && (
          <Box
            position="fixed"
            top={0}
            left={0}
            w="full"
            h="full"
            bg="blackAlpha.600"
            zIndex={1000}
            onClick={toggleSidebar}
          >
            <Box
              w="280px"
              h="full"
              bg="primary.dark"
              onClick={(e) => e.stopPropagation()}
            >
              <SidebarContent onClose={toggleSidebar} />
            </Box>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box
      w={sidebarOpen ? "280px" : "80px"}
      transition="width 0.3s ease"
      position="relative"
    >
      {sidebarOpen ? (
        <SidebarContent />
      ) : (
        <Box w="80px" h="full" bg="primary.dark" borderRight="1px" borderColor="gray.700">
          <Stack gap={4} pt={4} alignItems="center">
            <Button
              variant="ghost"
              onClick={toggleSidebar}
              size="sm"
              color="accent.gray"
            >
              <Menu size={20} />
            </Button>
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    size="sm"
                    bg={isActive ? 'accent.green' : 'transparent'}
                    color={isActive ? 'white' : 'accent.gray'}
                    _hover={{
                      bg: isActive ? 'accent.greenSecondary' : 'gray.700',
                    }}
                  >
                    <Icon size={20} />
                  </Button>
                </Link>
              )
            })}
          </Stack>
        </Box>
      )}
    </Box>
  )
}