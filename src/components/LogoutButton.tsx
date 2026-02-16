'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LogOut, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogoutButtonProps {
  isMobile?: boolean
}

export default function LogoutButton({ isMobile = false }: LogoutButtonProps) {
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
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium',
        'text-text-muted hover:text-danger hover:bg-danger/10',
        'rounded-inner transition-colors duration-160 touch-manipulation',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isMobile ? 'p-2' : 'px-3 py-2'
      )}
      aria-label={isLoading ? 'Signing out...' : 'Sign out'}
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <LogOut size={isMobile ? 18 : 16} />
      )}
      {!isMobile && (isLoading ? 'Signing out...' : 'Sign Out')}
    </button>
  )
}