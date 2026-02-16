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
      <div className="bg-surface-1 border border-stroke-subtle rounded-card p-4">
        <h3 className="text-lg font-semibold text-warning mb-3">🔐 Test Authentication</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 bg-surface-2 text-text-primary rounded-inner border border-stroke-subtle"
              placeholder="test@example.com"
            />
          </div>
          
          <div>
            <label className="block text-sm text-text-secondary mb-1">Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 bg-surface-2 text-text-primary rounded-inner border border-stroke-subtle"
              placeholder="password123"
            />
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => handleAuth('signup')}
              disabled={isLoading}
              className="flex-1 bg-brand-primary hover:brightness-110 disabled:bg-surface-2 disabled:opacity-50 text-bg-base py-2 px-4 rounded-pill transition-all duration-160"
            >
              {isLoading ? 'Creating...' : 'Sign Up'}
            </button>
            
            <button
              onClick={() => handleAuth('login')}
              disabled={isLoading}
              className="flex-1 bg-brand-tertiary hover:bg-brand-tertiary/90 disabled:bg-surface-2 disabled:opacity-50 text-bg-base py-2 px-4 rounded-pill transition-all duration-160"
            >
              {isLoading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
          
          <button
            onClick={checkSession}
            className="w-full bg-brand-secondary hover:bg-brand-secondary/90 text-bg-base py-2 px-4 rounded-pill transition-all duration-160"
          >
            Check Session
          </button>
        </div>
      </div>
      
      {result && (
        <div className="bg-surface-1 border border-stroke-subtle rounded-card p-3">
          <h4 className="text-sm font-semibold text-text-secondary mb-2">Result:</h4>
          <pre className="text-xs text-brand-primary overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}