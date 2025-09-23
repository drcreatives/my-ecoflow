'use client'

import { useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { useDevices, useLatestReadings } from '@/hooks/useDevices'
import { AlertType, AlertSeverity } from '@/types'

export function useNotificationManager() {
  const { addNotification } = useUIStore()
  const { data: devices = [] } = useDevices()
  const { data: latestReadings = [] } = useLatestReadings()

  useEffect(() => {
    // Check for device-based alerts
    devices.forEach(device => {
      const reading = latestReadings.find(r => r.deviceId === device.id)
      
      if (!reading) return

      // Check for low battery
      if (reading.batteryLevel < 20) {
        addNotification({
          id: `low-battery-${device.id}-${Date.now()}`,
          deviceId: device.id,
          type: AlertType.BATTERY_LOW,
          title: 'Low Battery Alert',
          message: `${device.deviceName || device.deviceSn} battery is at ${reading.batteryLevel}%`,
          severity: AlertSeverity.MEDIUM,
          isRead: false,
          createdAt: new Date()
        })
      }

      // Check for device offline
      if (!device.online) {
        addNotification({
          id: `offline-${device.id}-${Date.now()}`,
          deviceId: device.id,
          type: AlertType.DEVICE_OFFLINE,
          title: 'Device Offline',
          message: `${device.deviceName || device.deviceSn} has gone offline`,
          severity: AlertSeverity.HIGH,
          isRead: false,
          createdAt: new Date()
        })
      }

      // Check for high temperature
      if (reading.temperature && reading.temperature > 40) {
        addNotification({
          id: `temp-high-${device.id}-${Date.now()}`,
          deviceId: device.id,
          type: AlertType.TEMPERATURE_HIGH,
          title: 'High Temperature Warning',
          message: `${device.deviceName || device.deviceSn} temperature is ${reading.temperature}°C`,
          severity: AlertSeverity.MEDIUM,
          isRead: false,
          createdAt: new Date()
        })
      }
    })
  }, [devices, latestReadings, addNotification])

  // Add some sample notifications on first load for demonstration
  useEffect(() => {
    const hasInitialized = localStorage.getItem('notifications-initialized')
    if (!hasInitialized && devices.length > 0) {
      const device = devices[0]
      
      // Add welcome notification
      addNotification({
        id: `welcome-${Date.now()}`,
        deviceId: device.id,
        type: AlertType.DEVICE_OFFLINE, // Using as a general type
        title: 'Welcome to EcoFlow Dashboard',
        message: 'Your dashboard is now active and monitoring your devices.',
        severity: AlertSeverity.LOW,
        isRead: false,
        createdAt: new Date()
      })

      // Add device connected notification
      addNotification({
        id: `connected-${Date.now()}`,
        deviceId: device.id,
        type: AlertType.DEVICE_OFFLINE, // Using as a general type
        title: 'Device Connected',
        message: `${device.deviceName || device.deviceSn} is now being monitored.`,
        severity: AlertSeverity.LOW,
        isRead: false,
        createdAt: new Date()
      })

      localStorage.setItem('notifications-initialized', 'true')
    }
  }, [devices, addNotification])
}