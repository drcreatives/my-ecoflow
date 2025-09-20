'use client'

// Temporary placeholder page - will be properly converted later
export default function DevicePage({ params }: { params: { deviceId: string } }) {
  return (
    <div className="min-h-screen bg-primary-black text-accent-gray p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-accent-green mb-4">Device Details</h1>
        <p className="text-accent-gray">Device page for ID: {params.deviceId}</p>
        <p className="text-gray-400 mt-2">This page will be properly implemented with Tailwind CSS.</p>
      </div>
    </div>
  )
}