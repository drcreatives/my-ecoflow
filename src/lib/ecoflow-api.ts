import axios, { AxiosInstance } from 'axios'

export interface DeviceStatus {
  deviceSn: string
  batteryLevel: number
  inputWatts: number
  outputWatts: number
  remainingTime: number
  temperature: number
  status: string
  timestamp: Date
}

export interface Device {
  deviceSn: string
  deviceName: string
  deviceType: string
  onlineStatus: boolean
}

export interface DeviceQuota {
  deviceSn: string
  quota: {
    requestCount: number
    remainingCount: number
    resetTime: Date
  }
}

export class EcoFlowAPI {
  private client: AxiosInstance
  private accessKey: string
  private secretKey: string
  private baseURL: string

  constructor() {
    this.accessKey = process.env.ECOFLOW_ACCESS_KEY!
    this.secretKey = process.env.ECOFLOW_SECRET_KEY!
    this.baseURL = 'https://api.ecoflow.com'

    if (!this.accessKey || !this.secretKey) {
      throw new Error('EcoFlow API credentials are not configured')
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add request interceptor for authentication
    this.client.interceptors.request.use((config) => {
      const timestamp = Date.now().toString()
      // Note: You'll need to implement the proper EcoFlow authentication signature
      // This is a placeholder for the authentication logic
      config.headers['Authorization'] = `Bearer ${this.accessKey}`
      config.headers['Timestamp'] = timestamp
      return config
    })

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('EcoFlow API Error:', error.response?.data || error.message)
        throw new APIError(
          error.response?.data?.message || 'EcoFlow API request failed',
          error.response?.status || 500
        )
      }
    )
  }

  /**
   * Get list of all devices
   */
  async getDeviceList(): Promise<Device[]> {
    try {
      const response = await this.client.get('/iot-open/sign/device/list')
      return this.transformDeviceList(response.data)
    } catch (error) {
      throw new APIError('Failed to fetch device list', 500)
    }
  }

  /**
   * Get device status and current readings
   */
  async getDeviceStatus(deviceSN: string): Promise<DeviceStatus> {
    try {
      const response = await this.client.get(`/iot-open/sign/device/quota`, {
        params: { deviceSn: deviceSN }
      })
      return this.transformDeviceStatus(response.data)
    } catch (error) {
      throw new APIError(`Failed to fetch device status for ${deviceSN}`, 500)
    }
  }

  /**
   * Get device quota information
   */
  async getDeviceQuota(deviceSN: string): Promise<DeviceQuota> {
    try {
      const response = await this.client.get(`/iot-open/sign/device/quota`, {
        params: { deviceSn: deviceSN }
      })
      return this.transformDeviceQuota(response.data)
    } catch (error) {
      throw new APIError(`Failed to fetch device quota for ${deviceSN}`, 500)
    }
  }

  /**
   * Set device function/control
   */
  async setDeviceFunction(deviceSN: string, params: any): Promise<any> {
    try {
      const response = await this.client.post('/iot-open/sign/device/control', {
        deviceSn: deviceSN,
        ...params
      })
      return response.data
    } catch (error) {
      throw new APIError(`Failed to control device ${deviceSN}`, 500)
    }
  }

  /**
   * Get historical data for a device
   */
  async getHistoricalData(
    deviceSN: string, 
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    try {
      const response = await this.client.get('/iot-open/sign/device/history', {
        params: {
          deviceSn: deviceSN,
          startTime: timeRange.start.getTime(),
          endTime: timeRange.end.getTime()
        }
      })
      return response.data
    } catch (error) {
      throw new APIError(`Failed to fetch historical data for ${deviceSN}`, 500)
    }
  }

  // Transform methods to normalize API responses
  private transformDeviceList(data: any): Device[] {
    // Transform the API response to our Device interface
    // This will need to be adjusted based on actual EcoFlow API response structure
    return data.data?.map((device: any) => ({
      deviceSn: device.deviceSn,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      onlineStatus: device.onlineStatus === 1
    })) || []
  }

  private transformDeviceStatus(data: any): DeviceStatus {
    // Transform the API response to our DeviceStatus interface
    // This will need to be adjusted based on actual EcoFlow API response structure
    return {
      deviceSn: data.deviceSn,
      batteryLevel: data.batteryLevel || 0,
      inputWatts: data.inputWatts || 0,
      outputWatts: data.outputWatts || 0,
      remainingTime: data.remainingTime || 0,
      temperature: data.temperature || 0,
      status: data.status || 'unknown',
      timestamp: new Date()
    }
  }

  private transformDeviceQuota(data: any): DeviceQuota {
    return {
      deviceSn: data.deviceSn,
      quota: {
        requestCount: data.quota?.requestCount || 0,
        remainingCount: data.quota?.remainingCount || 0,
        resetTime: new Date(data.quota?.resetTime || Date.now())
      }
    }
  }
}

export class APIError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(message)
    this.name = 'APIError'
  }
}

// Singleton instance
export const ecoflowAPI = new EcoFlowAPI()