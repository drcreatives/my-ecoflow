'use client'

import { useState } from 'react'

export default function DatabaseSetupButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleSetup = async () => {
    setIsLoading(true)
    setResult(null)
    
    try {
      const response = await fetch('/api/db-setup', { method: 'POST' })
      const data = await response.json()
      setResult(data)
      
      if (data.success) {
        alert('✅ Database tables created successfully!\n\nTables: ' + data.tables.map((t: any) => t.table_name).join(', '))
      } else {
        alert('❌ Database setup failed:\n' + data.message)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setResult({ error: errorMsg })
      alert('❌ Error: ' + errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button 
        onClick={handleSetup}
        disabled={isLoading}
        className={`block w-full py-2 px-4 rounded-pill transition-all duration-160 ease-dashboard text-center font-medium ${
          isLoading 
            ? 'bg-surface-2 text-text-muted cursor-not-allowed' 
            : 'bg-brand-primary hover:brightness-110 text-bg-base'
        }`}
      >
        {isLoading ? 'Creating Tables...' : 'Create Database Tables'}
      </button>
      
      {result && (
        <div className="text-xs bg-surface-2 border border-stroke-subtle rounded-inner p-2">
          <pre className="text-brand-primary overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}