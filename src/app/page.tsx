'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          // User is authenticated, redirect to dashboard
          router.push('/dashboard')
        } else {
          // User is not authenticated, redirect to login
          router.push('/login')
        }
      } catch (error) {
        console.error('Auth check error:', error)
        // On error, redirect to login
        router.push('/login')
      }
    }

    checkAuth()
  }, [router, supabase.auth])

  // Show loading state while checking authentication
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  )
}