'use client'

import { Box, Flex } from '@chakra-ui/react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useUIStore } from '@/stores/uiStore'

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
}

export const AppLayout = ({ children, title }: AppLayoutProps) => {
  const { sidebarOpen } = useUIStore()

  return (
    <Flex h="100vh" bg="primary.black">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <Flex direction="column" flex={1} overflow="hidden">
        {/* Header */}
        <Header title={title} />
        
        {/* Page Content */}
        <Box
          flex={1}
          overflow="auto"
          bg="primary.black"
          p={6}
        >
          {children}
        </Box>
      </Flex>
    </Flex>
  )
}