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
        className={`block w-full py-2 px-4 rounded transition-colors text-center font-medium ${
          isLoading 
            ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        }`}
      >
        {isLoading ? 'Creating Tables...' : 'Create Database Tables'}
      </button>
      
      {result && (
        <div className="text-xs bg-gray-800 p-2 rounded">
          <pre className="text-green-400 overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}