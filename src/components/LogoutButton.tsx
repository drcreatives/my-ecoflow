'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LogOut } from 'lucide-react'
import { Button } from '@chakra-ui/react'

export default function LogoutButton() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    setIsLoading(true)
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      onClick={handleLogout}
      isLoading={isLoading}
      loadingText="Signing out..."
      colorScheme="red"
      variant="ghost"
      size="sm"
      leftIcon={<LogOut size={16} />}
    >
      Sign Out
    </Button>
  )
}