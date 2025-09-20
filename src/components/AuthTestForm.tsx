'use client'

import { useState } from 'react'

export default function AuthTestForm() {
  const [email, setEmail] = useState('test@example.com')
  const [password, setPassword] = useState('password123')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleAuth = async (action: 'signup' | 'login') => {
    setIsLoading(true)
    setResult(null)
    
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, action })
      })
      
      const data = await response.json()
      setResult(data)
      
      if (data.success) {
        alert(`✅ ${action === 'signup' ? 'Signup' : 'Login'} successful!\n\nUser ID: ${data.user?.id}\nEmail: ${data.user?.email}`)
        
        // After successful auth, test the protected endpoints
        setTimeout(() => {
          window.open('/api/devices', '_blank')
        }, 1000)
      } else {
        alert(`❌ ${action === 'signup' ? 'Signup' : 'Login'} failed:\n${data.message || data.error}`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setResult({ error: errorMsg })
      alert('❌ Error: ' + errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth')
      const data = await response.json()
      setResult(data)
      
      alert(`Session Status:\n${data.authenticated ? '✅ Authenticated' : '❌ Not authenticated'}\n\n${JSON.stringify(data, null, 2)}`)
    } catch (error) {
      alert('Error checking session: ' + error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded">
        <h3 className="text-lg font-semibold text-yellow-400 mb-3">🔐 Test Authentication</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600"
              placeholder="test@example.com"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-300 mb-1">Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600"
              placeholder="password123"
            />
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => handleAuth('signup')}
              disabled={isLoading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white py-2 px-4 rounded transition-colors"
            >
              {isLoading ? 'Creating...' : 'Sign Up'}
            </button>
            
            <button
              onClick={() => handleAuth('login')}
              disabled={isLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-2 px-4 rounded transition-colors"
            >
              {isLoading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
          
          <button
            onClick={checkSession}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded transition-colors"
          >
            Check Session
          </button>
        </div>
      </div>
      
      {result && (
        <div className="bg-gray-800 p-3 rounded">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Result:</h4>
          <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}