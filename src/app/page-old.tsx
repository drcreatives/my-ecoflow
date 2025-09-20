'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import DatabaseSetupButton from '@/components/DatabaseSetupButton'
import AuthTestForm from '@/components/AuthTestForm'
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
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-green-400">
          EcoFlow Dashboard
        </h1>
        
        <div className="text-center mb-12">
          <p className="text-lg text-gray-300 mb-6">
            Monitor and control your EcoFlow Delta 2 power stations
          </p>
          
          <a 
            href="/login" 
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg inline-block transition-colors"
          >
            Get Started
          </a>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-900 p-6 rounded-lg border border-green-500">
            <h2 className="text-xl font-semibold mb-4 text-green-400">
              API Status
            </h2>
            <div className="space-y-4">
              <div>
                <a 
                  href="/api/test-ecoflow" 
                  target="_blank"
                  className="block bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors text-center"
                >
                  Test EcoFlow API Connection
                </a>
              </div>
              <div>
                <a 
                  href="/api/devices-test" 
                  target="_blank"
                  className="block bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors text-center"
                >
                  Test Devices API (No Auth)
                </a>
              </div>
              <div>
                <a 
                  href="/api/db-test" 
                  target="_blank"
                  className="block bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded transition-colors text-center"
                >
                  Test Database Connection
                </a>
              </div>
              <div>
                <DatabaseSetupButton />
              </div>
              <div>
                <a 
                  href="/api/db-setup" 
                  target="_blank"
                  className="block bg-teal-600 hover:bg-teal-700 text-white py-2 px-4 rounded transition-colors text-center"
                >
                  Check Database Schema
                </a>
              </div>
              <div>
                <a 
                  href="/api/env-check" 
                  target="_blank"
                  className="block bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded transition-colors text-center"
                >
                  Check Environment Variables
                </a>
              </div>
              <div>
                <a 
                  href="/api/auth-test" 
                  target="_blank"
                  className="block bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded transition-colors text-center"
                >
                  Test Authentication & DB
                </a>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 p-6 rounded-lg border border-blue-500">
            <h2 className="text-xl font-semibold mb-4 text-blue-400">
              🔐 Authentication Testing
            </h2>
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Test the authentication system and access protected endpoints like /api/devices
              </p>
              
              <AuthTestForm />
              
              <div className="border-t border-gray-700 pt-4">
                <p className="text-xs text-gray-500">
                  After successful login, the /api/devices endpoint will automatically open in a new tab.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-gray-900 p-6 rounded-lg border border-green-500">
          <h2 className="text-xl font-semibold mb-4 text-green-400">
            ✅ Database Setup Complete!
          </h2>
          <p className="text-gray-300 mb-4">
            Your Prisma database tables have been successfully created in Supabase! All core infrastructure is now ready.
          </p>
          <div className="bg-gray-800 p-4 rounded mb-4">
            <h3 className="font-semibold mb-2 text-green-300">✅ Completed Setup:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
              <li><strong>Environment Variables:</strong> All required variables configured</li>
              <li><strong>Database Connection:</strong> Prisma connected to Supabase PostgreSQL</li>
              <li><strong>Database Tables:</strong> User, Device, DeviceReading, DeviceAlert tables created</li>
              <li><strong>EcoFlow API:</strong> Access keys working and device fetching functional</li>
            </ul>
          </div>
          <div className="bg-gray-800 p-4 rounded">
            <h3 className="font-semibold mb-2 text-blue-300">� Next: Authentication Setup</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-300">
              <li>Enable Supabase Authentication in your project dashboard</li>
              <li>Create a test user account or implement signup/login</li>
              <li>Test the authenticated API endpoints</li>
              <li>Access the full dashboard functionality</li>
            </ol>
          </div>
        </div>
      </div>
    </main>
  )
}