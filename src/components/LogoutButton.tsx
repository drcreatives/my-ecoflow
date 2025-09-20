'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LogOut, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium',
        'text-red-400 hover:text-red-300 hover:bg-red-500/10',
        'rounded-md transition-colors duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <LogOut size={16} />
      )}
      {isLoading ? 'Signing out...' : 'Sign Out'}
    </button>
  )
}