'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { useClientSideReadingCollection } from '@/hooks/useClientSideReadingCollection'
import { useDevices } from '@/hooks/useDevices'

interface AuthWrapperProps {
  children: React.ReactNode
  redirectTo?: string
}

export default function AuthWrapper({ children, redirectTo = '/login' }: AuthWrapperProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  const { refetch: refetchDevices } = useDevices()
  
  // Start automatic reading collection for authenticated users (every 5 minutes)
  const { startCollection } = useClientSideReadingCollection(5)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          setUser(session.user)
          // Start background reading collection for authenticated users
          console.log('🔄 User already authenticated - starting background reading collection')
          refetchDevices()
          startCollection()
        } else {
          router.push(redirectTo)
          return
        }
      } catch (error) {
        console.error('Auth check error:', error)
        router.push(redirectTo)
        return
      } finally {
        setLoading(false)
      }
    }

    checkAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          // Start background reading collection when user signs in
          console.log('🔄 User authenticated - starting background reading collection')
          refetchDevices()
          startCollection()
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          router.push(redirectTo)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [router, redirectTo, supabase.auth, refetchDevices, startCollection])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Router will redirect
  }

  return <>{children}</>
}