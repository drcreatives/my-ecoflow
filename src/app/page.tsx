'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useConvexAuth } from 'convex/react'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const router = useRouter()
  const { isLoading, isAuthenticated } = useConvexAuth()

  useEffect(() => {
    if (isLoading) return

    if (isAuthenticated) {
      router.push('/dashboard')
    } else {
      router.push('/login')
    }
  }, [isLoading, isAuthenticated, router])

  // Show loading state while checking authentication
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto mb-4" />
        <p className="text-text-muted">Loading...</p>
      </div>
    </div>
  )
}