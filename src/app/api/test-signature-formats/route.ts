import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  try {
    console.log('=== EcoFlow Signature Format Test ===')
    
    const accessKey = process.env.ECOFLOW_ACCESS_KEY!
    const secretKey = process.env.ECOFLOW_SECRET_KEY!
    
    const timestamp = Date.now()
    const nonce = crypto.randomBytes(16).toString('hex')
    const method = 'GET'
    const endpoint = '/iot-open/sign/device/list'
    const params: Record<string, any> = {}
    
    // Sort parameters (empty in this case)
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&')

    // Test different signature string formats
    const signatureFormats = [
      {
        name: 'Current Format',
        stringToSign: `${method}\n${endpoint}\n${sortedParams}\n${accessKey}\n${nonce}\n${timestamp}`
      },
      {
        name: 'Timestamp First',
        stringToSign: `${method}\n${endpoint}\n${sortedParams}\n${accessKey}\n${timestamp}\n${nonce}`
      },
      {
        name: 'No Newlines',
        stringToSign: `${method}${endpoint}${sortedParams}${accessKey}${nonce}${timestamp}`
      },
      {
        name: 'Different Order 1',
        stringToSign: `${accessKey}${nonce}${timestamp}${method}${endpoint}${sortedParams}`
      },
      {
        name: 'Different Order 2',
        stringToSign: `${timestamp}${nonce}${accessKey}${method}${endpoint}${sortedParams}`
      },
      {
        name: 'URL Path Only',
        stringToSign: `${method}\n${endpoint}\n${accessKey}\n${nonce}\n${timestamp}`
      }
    ]

    const results = []

    for (const format of signatureFormats) {
      try {
        console.log(`\n=== Testing ${format.name} ===`)
        console.log('String to sign:', format.stringToSign)

        // Generate HMAC-SHA256 signature
        const signature = crypto
          .createHmac('sha256', secretKey)
          .update(format.stringToSign)
          .digest('hex')

        console.log('Generated signature:', signature.substring(0, 16) + '...')

        // Prepare headers
        const headers = {
          'Content-Type': 'application/json',
          'accessKey': accessKey,
          'nonce': nonce,
          'timestamp': timestamp.toString(),
          'sign': signature,
        }

        const url = `https://api.ecoflow.com${endpoint}`
        
        console.log('Making request to:', url)

        const response = await fetch(url, {
          method: 'GET',
          headers,
        })

        console.log('Response status:', response.status)

        let responseData
        try {
          responseData = await response.json()
          console.log('Response data:', responseData)
        } catch (jsonError) {
          responseData = await response.text()
          console.log('Response text:', responseData)
        }

        results.push({
          format: format.name,
          stringToSign: format.stringToSign,
          signature: signature.substring(0, 16) + '...',
          status: response.status,
          success: response.ok && responseData.code === '0',
          data: responseData
        })

        // If this format works (code === '0'), break early
        if (responseData.code === '0') {
          console.log(`✅ SUCCESS with ${format.name}!`)
          break
        }

      } catch (error: any) {
        console.error(`Error testing ${format.name}:`, error.message)
        results.push({
          format: format.name,
          error: error.message,
          success: false
        })
      }
    }

    return NextResponse.json({
      success: true,
      results,
      debug: {
        timestamp,
        nonce,
        accessKeyPrefix: accessKey.substring(0, 8) + '...',
        secretKeyPrefix: secretKey.substring(0, 8) + '...'
      }
    })

  } catch (error: any) {
    console.error('=== Signature Test Error ===')
    console.error('Error:', error)

    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error occurred'
    }, { status: 500 })
  }
}