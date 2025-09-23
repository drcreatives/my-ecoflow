import { toast } from 'sonner'

// API Error class for better error handling
export class APIError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.code = code
  }
}

// Base API client with consistent error handling
class APIClient {
  private baseURL: string

  constructor(baseURL = '') {
    this.baseURL = baseURL
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        let errorData: any = {}
        try {
          errorData = await response.json()
        } catch {
          // If response is not JSON, use status text
          errorData = { error: response.statusText }
        }

        throw new APIError(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData.code
        )
      }

      // Handle empty responses (204 No Content)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {} as T
      }

      return await response.json()
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }

      // Network error or other fetch error
      throw new APIError(
        error instanceof Error ? error.message : 'Network error',
        0
      )
    }
  }

  // GET request
  async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', ...options })
  }

  // POST request
  async post<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    })
  }

  // PUT request
  async put<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    })
  }

  // DELETE request
  async delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', ...options })
  }

  // PATCH request
  async patch<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    })
  }
}

// Create singleton API client
export const apiClient = new APIClient('/api')

// Device API functions
export const deviceAPI = {
  getDevices: () => apiClient.get<{ devices: any[] }>('/devices'),
  getDevice: (id: string) => apiClient.get<{ device: any }>(`/devices/${id}`),
  createDevice: (data: any) => apiClient.post<{ device: any }>('/devices', data),
  updateDevice: (id: string, data: any) => apiClient.put<{ device: any }>(`/devices/${id}`, data),
  deleteDevice: (id: string) => apiClient.delete(`/devices/${id}`),
  getDeviceReadings: (deviceId: string, limit?: number) => 
    apiClient.get<any[]>(`/devices/${deviceId}/readings${limit ? `?limit=${limit}` : ''}`),
  getLatestReadings: () => apiClient.get<any[]>('/devices/latest-readings'),
  collectReadings: (force = false) => 
    apiClient.post<any>(`/devices/collect-readings${force ? '?force=true' : ''}`),
  discoverDevices: () => apiClient.get<{ devices: any[] }>('/devices/discover'),
  registerDevice: (data: any) => apiClient.post<{ device: any }>('/devices/register', data),
}

// User API functions
export const userAPI = {
  getProfile: () => apiClient.get<{ profile: any }>('/user/profile'),
  updateProfile: (data: any) => apiClient.put<{ profile: any }>('/user/profile', data),
  changePassword: (data: any) => apiClient.post<{ success: boolean }>('/user/change-password', data),
  getNotificationSettings: () => apiClient.get<{ settings: any }>('/user/notifications'),
  updateNotificationSettings: (data: any) => apiClient.put<{ settings: any }>('/user/notifications', data),
  getDataRetentionSettings: () => apiClient.get<{ settings: any }>('/user/data-retention'),
  updateDataRetentionSettings: (data: any) => apiClient.put<{ settings: any }>('/user/data-retention', data),
  getSessionSettings: () => apiClient.get<{ settings: any }>('/user/session-settings'),
  updateSessionSettings: (data: any) => apiClient.put<{ settings: any }>('/user/session-settings', data),
  exportData: (format = 'json') => apiClient.get(`/user/backup?format=${format}`),
}

// System API functions
export const systemAPI = {
  testEmail: () => apiClient.get<{ success: boolean }>('/email/test'),
  sendEmail: (data: any) => apiClient.post<{ success: boolean }>('/email/send', data),
  getCollectionStatus: () => apiClient.get<any>('/monitor-readings'),
}

// Error handler for mutations
export const handleMutationError = (error: unknown, defaultMessage = 'Operation failed') => {
  if (error instanceof APIError) {
    // Handle specific HTTP status codes
    switch (error.status) {
      case 401:
        toast.error('Session expired. Please log in again.')
        // Optionally redirect to login
        // window.location.href = '/login'
        break
      case 403:
        toast.error('You do not have permission to perform this action')
        break
      case 404:
        toast.error('Resource not found')
        break
      case 422:
        toast.error('Invalid data provided. Please check your inputs.')
        break
      case 429:
        toast.error('Too many requests. Please wait a moment.')
        break
      case 500:
        toast.error('Server error. Please try again later.')
        break
      default:
        toast.error(error.message || defaultMessage)
    }
  } else if (error instanceof Error) {
    if (error.message.includes('fetch')) {
      toast.error('Network error. Please check your connection.')
    } else {
      toast.error(error.message || defaultMessage)
    }
  } else {
    toast.error(defaultMessage)
  }
}