import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  try {
    console.log('=== EcoFlow API Raw Test Start ===')
    
    // Check environment variables
    const accessKey = process.env.ECOFLOW_ACCESS_KEY
    const secretKey = process.env.ECOFLOW_SECRET_KEY
    
    console.log('Environment Check:')
    console.log('- Access Key exists:', !!accessKey)
    console.log('- Secret Key exists:', !!secretKey)
    console.log('- Access Key prefix:', accessKey?.substring(0, 8) + '...')
    
    if (!accessKey || !secretKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing EcoFlow credentials in environment variables'
      }, { status: 500 })
    }

    // Test multiple potential endpoints and base URLs
    const testConfigs = [
      {
        name: 'Current Config',
        baseURL: 'https://api.ecoflow.com',
        endpoint: '/iot-open/sign/device/list'
      },
      {
        name: 'Alternative 1',
        baseURL: 'https://api.ecoflow.com',
        endpoint: '/iot-service/open/api/device/queryDeviceList'
      },
      {
        name: 'Alternative 2',
        baseURL: 'https://api.ecoflow.com',
        endpoint: '/iot-open/sign/device/queryDeviceList'
      },
      {
        name: 'API v2',
        baseURL: 'https://api-v2.ecoflow.com',
        endpoint: '/iot-open/sign/device/list'
      }
    ]

    const results = []

    for (const config of testConfigs) {
      try {
        console.log(`\n=== Testing ${config.name} ===`)
        console.log(`URL: ${config.baseURL}${config.endpoint}`)

        const timestamp = Date.now()
        const nonce = crypto.randomBytes(16).toString('hex')
        const method = 'GET'
        const params: Record<string, any> = {}
        
        // Sort parameters (empty in this case)
        const sortedParams = Object.keys(params)
          .sort()
          .map(key => `${key}=${params[key]}`)
          .join('&')

        // Create string to sign
        const stringToSign = `${method}\n${config.endpoint}\n${sortedParams}\n${accessKey}\n${nonce}\n${timestamp}`

        // Generate HMAC-SHA256 signature
        const signature = crypto
          .createHmac('sha256', secretKey)
          .update(stringToSign)
          .digest('hex')

        console.log('Nonce:', nonce)
        console.log('String to sign:', stringToSign)
        console.log('Generated signature:', signature.substring(0, 16) + '...')

        // Prepare headers
        const headers = {
          'Content-Type': 'application/json',
          'accessKey': accessKey,
          'nonce': nonce,
          'timestamp': timestamp.toString(),
          'sign': signature,
        }

        const url = `${config.baseURL}${config.endpoint}`
        
        console.log('Making request to:', url)
        console.log('Headers:', { ...headers, accessKey: accessKey.substring(0, 8) + '...', sign: signature.substring(0, 16) + '...', nonce: nonce.substring(0, 8) + '...' })

        const response = await fetch(url, {
          method: 'GET',
          headers,
        })

        console.log('Response status:', response.status)
        console.log('Response status text:', response.statusText)

        let responseData
        try {
          responseData = await response.json()
          console.log('Response data:', responseData)
        } catch (jsonError) {
          responseData = await response.text()
          console.log('Response text:', responseData)
        }

        results.push({
          config: config.name,
          url,
          status: response.status,
          statusText: response.statusText,
          success: response.ok,
          data: responseData
        })

      } catch (error: any) {
        console.error(`Error testing ${config.name}:`, error.message)
        results.push({
          config: config.name,
          url: `${config.baseURL}${config.endpoint}`,
          error: error.message,
          success: false
        })
      }
    }

    return NextResponse.json({
      success: true,
      results,
      debug: {
        timestamp: new Date().toISOString(),
        accessKeyPrefix: accessKey.substring(0, 8) + '...',
        secretKeyPrefix: secretKey.substring(0, 8) + '...'
      }
    })

  } catch (error: any) {
    console.error('=== Raw Test Error ===')
    console.error('Error:', error)

    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error occurred',
      details: {
        type: error.constructor.name,
        stack: error.stack?.split('\n').slice(0, 5)
      }
    }, { status: 500 })
  }
}