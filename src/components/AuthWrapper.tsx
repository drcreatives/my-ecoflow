'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { useClientSideReadingCollection } from '@/hooks/useClientSideReadingCollection'
import { useDeviceStore } from '@/stores/deviceStore'

interface AuthWrapperProps {
  children: React.ReactNode
  redirectTo?: string
}

// Global state to persist auth across navigations
let globalAuthState: {
  user: User | null
  initialized: boolean
  devicesLoaded: boolean
  collectionStarted: boolean
} = {
  user: null,
  initialized: false,
  devicesLoaded: false,
  collectionStarted: false
}

export default function AuthWrapper({ children, redirectTo = '/login' }: AuthWrapperProps) {
  const [user, setUser] = useState<User | null>(globalAuthState.user)
  const [loading, setLoading] = useState(!globalAuthState.initialized)
  const router = useRouter()
  const supabase = createClient()
  const { fetchDevices, devices } = useDeviceStore()
  const initializationRef = useRef(false)
  
  // Start automatic reading collection for authenticated users (every 5 minutes)
  const { startCollection } = useClientSideReadingCollection(5)

  useEffect(() => {
    // Prevent multiple simultaneous initializations
    if (initializationRef.current) return
    
    const checkAuth = async () => {
      try {
        // If we already have a valid user from global state, skip session check
        if (globalAuthState.initialized && globalAuthState.user) {
          console.log('🔄 Using cached auth state - skipping session check')
          setUser(globalAuthState.user)
          setLoading(false)
          
          // Only fetch devices if not already loaded
          if (!globalAuthState.devicesLoaded && devices.length === 0) {
            console.log('📱 Loading devices for cached user...')
            await fetchDevices()
            globalAuthState.devicesLoaded = true
          }
          
          // Only start collection if not already started
          if (!globalAuthState.collectionStarted) {
            console.log('🚀 Starting reading collection for cached user...')
            startCollection()
            globalAuthState.collectionStarted = true
          }
          
          return
        }

        // First time initialization or session expired
        console.log('� Performing initial auth check...')
        initializationRef.current = true
        
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          console.log('✅ User authenticated - initializing app state')
          
          // Update both local and global state
          setUser(session.user)
          globalAuthState.user = session.user
          globalAuthState.initialized = true
          
          // Load devices if not already loaded
          if (!globalAuthState.devicesLoaded) {
            console.log('📱 Loading devices for new session...')
            await fetchDevices()
            globalAuthState.devicesLoaded = true
          }
          
          // Start collection if not already started
          if (!globalAuthState.collectionStarted) {
            console.log('🚀 Starting reading collection for new session...')
            startCollection()
            globalAuthState.collectionStarted = true
          }
        } else {
          console.log('❌ No valid session - redirecting to login')
          // Reset global state
          globalAuthState = {
            user: null,
            initialized: true,
            devicesLoaded: false,
            collectionStarted: false
          }
          router.push(redirectTo)
          return
        }
      } catch (error) {
        console.error('Auth check error:', error)
        // Reset global state on error
        globalAuthState = {
          user: null,
          initialized: true,
          devicesLoaded: false,
          collectionStarted: false
        }
        router.push(redirectTo)
        return
      } finally {
        setLoading(false)
        initializationRef.current = false
      }
    }

    checkAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state change:', event)
        
        if (event === 'SIGNED_IN' && session?.user) {
          // Update both local and global state
          setUser(session.user)
          globalAuthState.user = session.user
          globalAuthState.initialized = true
          
          // Load devices if not already loaded
          if (!globalAuthState.devicesLoaded) {
            console.log('� Loading devices after sign in...')
            await fetchDevices()
            globalAuthState.devicesLoaded = true
          }
          
          // Start collection if not already started
          if (!globalAuthState.collectionStarted) {
            console.log('🚀 Starting reading collection after sign in...')
            startCollection()
            globalAuthState.collectionStarted = true
          }
        } else if (event === 'SIGNED_OUT') {
          console.log('👋 User signed out - resetting state')
          // Reset both local and global state
          setUser(null)
          globalAuthState = {
            user: null,
            initialized: true,
            devicesLoaded: false,
            collectionStarted: false
          }
          router.push(redirectTo)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [router, redirectTo, supabase.auth, fetchDevices, startCollection, devices.length])

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