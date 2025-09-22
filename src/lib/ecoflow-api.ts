import crypto from 'crypto'

// For handling SSL certificates in production
const isProduction = process.env.NODE_ENV === 'production'

// Types for EcoFlow API responses
export interface EcoFlowDevice {
  sn: string
  productType: string
  productName: string
  online: number
  status: string
}

export interface DeviceQuotaData {
  sn: string
  quotaMap: {
    [key: string]: {
      val: number
      scale: number
    }
  }
}

export interface SetCommandParams {
  cmdSet: number
  cmdId: number
  param: Record<string, unknown>
}

export interface APIResponse<T = Record<string, unknown>> {
  code: string
  message: string
  data: T
  tid?: string
}

export interface EcoFlowCredentials {
  accessKey: string
  secretKey: string
}

export class EcoFlowAPIError extends Error {
  constructor(
    message: string, 
    public code?: string, 
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message)
    this.name = 'EcoFlowAPIError'
  }
}

/**
 * EcoFlow API Wrapper Class
 * Handles authentication, requests, and data transformation for EcoFlow devices
 */
export class EcoFlowAPI {
  private readonly baseURL = 'https://api-e.ecoflow.com'
  private readonly credentials: EcoFlowCredentials

  constructor(credentials?: EcoFlowCredentials) {
    this.credentials = credentials || {
      accessKey: process.env.ECOFLOW_ACCESS_KEY!,
      secretKey: process.env.ECOFLOW_SECRET_KEY!
    }

    if (!this.credentials.accessKey || !this.credentials.secretKey) {
      throw new EcoFlowAPIError('EcoFlow API credentials are required')
    }
  }

  /**
   * Generate authentication signature for EcoFlow API
   * Based on official documentation: https://developer-eu.ecoflow.com/
   */
  private generateSignature(
    method: string,
    endpoint: string,
    params: Record<string, string | number> = {},
    timestamp: number,
    nonce: string
  ): string {
    // Add authentication parameters to the params object
    const allParams: Record<string, string | number> = {
      ...params,
      accessKey: this.credentials.accessKey,
      nonce: nonce,
      timestamp: timestamp
    }

    // Sort parameters by ASCII value and concatenate with = and &
    const sortedParams = Object.keys(allParams)
      .sort()
      .map(key => `${key}=${allParams[key]}`)
      .join('&')

    // Generate HMAC-SHA256 signature using the sorted parameter string
    const signature = crypto
      .createHmac('sha256', this.credentials.secretKey)
      .update(sortedParams)
      .digest('hex')

    return signature
  }

  /**
   * Make authenticated request to EcoFlow API
   */
  private async makeRequest<T = Record<string, unknown>>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    params: Record<string, string | number> = {},
    body?: unknown
  ): Promise<APIResponse<T>> {
    const timestamp = Date.now()
    const nonce = Math.floor(100000 + Math.random() * 900000).toString() // 6-digit random number
    const url = `${this.baseURL}${endpoint}`
    
    // Generate signature (revert to simple approach that works for device list)
    const signature = this.generateSignature(method, endpoint, params, timestamp, nonce)

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'accessKey': this.credentials.accessKey,
      'nonce': nonce,
      'timestamp': timestamp.toString(),
      'sign': signature,
    }

    // Build URL with query parameters for GET requests
    const searchParams = new URLSearchParams()
    if (method === 'GET' && Object.keys(params).length > 0) {
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value))
      })
    }

    const requestUrl = searchParams.toString() 
      ? `${url}?${searchParams.toString()}` 
      : url

    try {
      // For production environments with SSL certificate issues
      if (isProduction && typeof process !== 'undefined' && process.env) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
      }

      const response = await fetch(requestUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        throw new EcoFlowAPIError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status.toString(),
          response.status
        )
      }

      const data: APIResponse<T> = await response.json()

      // Check API response code
      if (data.code !== '0') {
        throw new EcoFlowAPIError(
          data.message || 'API request failed',
          data.code,
          response.status,
          data
        )
      }

      return data
    } catch (error) {
      if (error instanceof EcoFlowAPIError) {
        throw error
      }

      throw new EcoFlowAPIError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR'
      )
    }
  }

  /**
   * Get list of devices associated with the account
   */
  async getDeviceList(): Promise<EcoFlowDevice[]> {
    try {
      const response = await this.makeRequest<EcoFlowDevice[]>('/iot-open/sign/device/list')
      return response.data || []
    } catch (error) {
      throw new EcoFlowAPIError(
        'Failed to fetch device list',
        'DEVICE_LIST_ERROR',
        undefined,
        error
      )
    }
  }

  /**
   * Get device quota data (real-time status information)
   */
  async getDeviceQuota(deviceSN: string): Promise<DeviceQuotaData | null> {
    if (!deviceSN) {
      throw new EcoFlowAPIError('Device serial number is required', 'INVALID_PARAMS')
    }

    try {
      // IMPORTANT: Quota API signature excludes sn parameter (unlike other endpoints)
      // The sn goes in the URL query string but NOT in the signature calculation
      
      const timestamp = Date.now()
      const nonce = Math.floor(100000 + Math.random() * 900000).toString()
      
      // Generate signature with only auth params (no sn)
      const signature = this.generateSignature('GET', '/iot-open/sign/device/quota/all', {}, timestamp, nonce)
      
      // Build URL with sn as query parameter
      const url = `${this.baseURL}/iot-open/sign/device/quota/all?sn=${deviceSN}`
      
      // For production environments with SSL certificate issues
      if (isProduction && typeof process !== 'undefined' && process.env) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'accessKey': this.credentials.accessKey,
          'nonce': nonce,
          'timestamp': timestamp.toString(),
          'sign': signature,
        }
      })

      if (!response.ok) {
        throw new EcoFlowAPIError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status.toString(),
          response.status
        )
      }

      const data: APIResponse<Record<string, unknown>> = await response.json()

      if (data.code !== '0') {
        throw new EcoFlowAPIError(
          data.message || 'Quota API request failed',
          data.code,
          response.status,
          data
        )
      }
      
      // Transform the response to match our DeviceQuotaData interface
      if (data.data) {
        return {
          sn: deviceSN,
          quotaMap: this.transformQuotaAllResponse(data.data as Record<string, string | number>)
        }
      }
      
      return null
    } catch (error) {
      throw new EcoFlowAPIError(
        `Failed to fetch device quota for ${deviceSN}`,
        'DEVICE_QUOTA_ERROR',
        undefined,
        error
      )
    }
  }

  /**
   * Transform the quota/all response to our quotaMap format
   * EcoFlow Delta 2 returns: { "bms_bmsStatus.soc": 79, "pd.remainTime": -5939 }
   * We need: { "bms_bmsStatus.soc": { val: 79, scale: 0 } }
   */
  private transformQuotaAllResponse(data: Record<string, string | number>): Record<string, { val: number, scale: number }> {
    const quotaMap: Record<string, { val: number, scale: number }> = {}
    
    for (const [key, value] of Object.entries(data)) {
      // Convert string/number values to numbers
      const numValue = typeof value === 'string' ? parseFloat(value) : value
      const finalValue = isNaN(numValue) ? 0 : numValue
      
      quotaMap[key] = {
        val: finalValue,
        scale: 0 // Delta 2 values don't seem to need scaling based on examples
      }
    }
    
    return quotaMap
  }

  /**
   * Send command to device (control device functions)
   */
  async setDeviceFunction(
    deviceSN: string, 
    params: SetCommandParams
  ): Promise<boolean> {
    if (!deviceSN || !params) {
      throw new EcoFlowAPIError('Device SN and command parameters are required', 'INVALID_PARAMS')
    }

    try {
      const response = await this.makeRequest(
        '/iot-open/sign/device/quota',
        'POST',
        { sn: deviceSN },
        params
      )
      return response.code === '0'
    } catch (error) {
      throw new EcoFlowAPIError(
        `Failed to control device ${deviceSN}`,
        'DEVICE_CONTROL_ERROR',
        undefined,
        error
      )
    }
  }

  /**
   * Transform quota data to our internal device reading format
   */
  transformQuotaToReading(quotaData: DeviceQuotaData, deviceId: string) {
    if (!quotaData?.quotaMap) {
      return null
    }

    const quota = quotaData.quotaMap
    
    // Try to get granular power output data
    const acOutputWatts = this.getQuotaValue(quota, 'inv.outputWatts') || 
                         this.getQuotaValue(quota, 'inv.acOutputWatts') || 
                         this.getQuotaValue(quota, 'ac.outputWatts') || 0
    
    const dcOutputWatts = this.getQuotaValue(quota, 'pd.dcOutputWatts') || 
                         this.getQuotaValue(quota, 'dcdc.outputWatts') || 0
    
    const usbOutputWatts = this.getQuotaValue(quota, 'pd.usbOutputWatts') || 
                          this.getQuotaValue(quota, 'usb.outputWatts') || 
                          this.getQuotaValue(quota, 'pd.usbUsedWatts') || 0
    
    // Calculate total output (fallback to API total if granular data not available)
    const totalOutput = this.getQuotaValue(quota, 'pd.wattsOutSum') || 
                       this.getQuotaValue(quota, 'inv.outputWatts') || 
                       (acOutputWatts + dcOutputWatts + usbOutputWatts)
    
    return {
      deviceId,
      batteryLevel: this.getQuotaValue(quota, 'bms_bmsStatus.soc'),
      inputWatts: this.getQuotaValue(quota, 'inv.inputWatts'),
      outputWatts: totalOutput,
      acOutputWatts: acOutputWatts,
      dcOutputWatts: dcOutputWatts,
      usbOutputWatts: usbOutputWatts,
      remainingTime: this.getQuotaValue(quota, 'bms_bmsStatus.remainTime'),
      temperature: this.getQuotaValue(quota, 'bms_bmsStatus.temp'),
      status: this.determineDeviceStatus(quota),
      rawData: quotaData,
      recordedAt: new Date(),
    }
  }

  /**
   * Extract and scale quota values
   */
  private getQuotaValue(quotaMap: Record<string, { val: number; scale?: number }>, key: string): number | null {
    const value = quotaMap[key]
    if (!value || typeof value.val !== 'number') {
      return null
    }
    
    // Apply scaling if present
    const scale = value.scale || 0
    return scale > 0 ? value.val / scale : value.val
  }

  /**
   * Determine device status based on quota data
   */
  private determineDeviceStatus(quotaMap: Record<string, { val: number; scale?: number }>): string {
    const inputWatts = this.getQuotaValue(quotaMap, 'inv.inputWatts') || 0
    const outputWatts = this.getQuotaValue(quotaMap, 'pd.wattsOutSum') || this.getQuotaValue(quotaMap, 'inv.outputWatts') || 0 // Total output (AC + DC)
    const batteryLevel = this.getQuotaValue(quotaMap, 'bms_bmsStatus.soc') || 0

    if (inputWatts > 10) {
      return 'charging'
    } else if (outputWatts > 10) {
      return 'discharging'
    } else if (batteryLevel > 95) {
      return 'full'
    } else if (batteryLevel < 10) {
      return 'low'
    }
    
    return 'standby'
  }

  /**
   * Health check - verify API connectivity and credentials
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getDeviceList()
      return true
    } catch (error) {
      console.error('EcoFlow API health check failed:', error)
      return false
    }
  }
}

// Singleton instance
export const ecoflowAPI = new EcoFlowAPI()