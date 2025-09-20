'use client'

// Temporary placeholder - will be properly converted later
export const DeviceStatusCard = ({ device, isCompact }: { device: any; isCompact?: boolean }) => {
  return (
    <div className="p-6 bg-primary-dark rounded-lg border border-accent-green">
      <h3 className="text-lg font-bold text-accent-green mb-4">Device Status Card</h3>
      <p className="text-accent-gray">Device status will be shown here.</p>
    </div>
  )
}