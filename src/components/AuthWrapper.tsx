'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useConvexAuth } from 'convex/react'
import { Loader2 } from 'lucide-react'

interface AuthWrapperProps {
  children: React.ReactNode
  redirectTo?: string
}

/**
 * Client-side auth gate using Convex Auth.
 * Redirects unauthenticated users to the login page.
 * Replaces the old Supabase-based AuthWrapper.
 */
export default function AuthWrapper({
  children,
  redirectTo = '/login',
}: AuthWrapperProps) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo)
    }
  }, [isLoading, isAuthenticated, router, redirectTo])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto mb-4" />
          <p className="text-text-muted">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}

