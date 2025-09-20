export default function LoginPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="bg-gray-900 p-8 rounded-lg border border-green-500">
          <h1 className="text-2xl font-bold text-center mb-8 text-green-400">
            Login to EcoFlow Dashboard
          </h1>
          
          <div className="bg-yellow-900 border border-yellow-500 p-4 rounded mb-6">
            <h2 className="text-yellow-300 font-semibold mb-2">
              Authentication Setup Required
            </h2>
            <p className="text-yellow-100 text-sm">
              To use this login page, you need to set up Supabase authentication. 
              For now, use the test endpoints to verify your EcoFlow API connection.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <a 
                href="/" 
                className="block bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded transition-colors text-center"
              >
                ← Back to Home
              </a>
            </div>
            <div>
              <a 
                href="/api/test-ecoflow" 
                target="_blank"
                className="block bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors text-center"
              >
                Test EcoFlow API
              </a>
            </div>
            <div>
              <a 
                href="/api/devices-test" 
                target="_blank"
                className="block bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition-colors text-center"
              >
                Test Devices API
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}