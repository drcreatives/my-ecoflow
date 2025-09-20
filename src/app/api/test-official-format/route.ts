import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  try {
    console.log('=== EcoFlow Official Format Test ===')
    
    const accessKey = process.env.ECOFLOW_ACCESS_KEY!
    const secretKey = process.env.ECOFLOW_SECRET_KEY!
    
    // Use the exact format from the documentation example
    const timestamp = Date.now()
    const nonce = Math.floor(100000 + Math.random() * 900000).toString() // 6-digit random number
    const endpoint = '/iot-open/sign/device/list'
    
    console.log('Test Parameters:')
    console.log('- Access Key:', accessKey.substring(0, 8) + '...')
    console.log('- Timestamp:', timestamp)
    console.log('- Nonce:', nonce)
    
    // Create parameter string according to documentation:
    // "accessKey, nonce, timestamp" should be included in the sorted parameters
    const params: Record<string, any> = {
      accessKey: accessKey,
      nonce: nonce,
      timestamp: timestamp
    }
    
    // Sort parameters by ASCII value and concatenate with = and &
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&')
    
    console.log('Sorted parameter string:', sortedParams)
    
    // Generate HMAC-SHA256 signature using the sorted parameter string
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(sortedParams)
      .digest('hex')
    
    console.log('Generated signature:', signature)
    
    // Prepare headers according to documentation
    const headers = {
      'accessKey': accessKey,
      'nonce': nonce,
      'timestamp': timestamp.toString(),
      'sign': signature,
    }
    
    const url = `https://api-e.ecoflow.com${endpoint}`
    
    console.log('Making request to:', url)
    console.log('Headers:', { 
      ...headers, 
      accessKey: accessKey.substring(0, 8) + '...', 
      sign: signature.substring(0, 16) + '...' 
    })
    
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
    
    // Test with the example from documentation to verify signature generation
    console.log('\n=== Testing with documentation example ===')
    const docExample = {
      accessKey: 'Fp4SvIprYSDPXtYJidEtUAd1o',
      nonce: '345164',
      timestamp: '1671171709428',
      sn: '123456789',
      'params.cmdSet': '11',
      'params.eps': '0',
      'params.id': '24'
    }
    
    const docSortedParams = Object.keys(docExample)
      .sort()
      .map(key => `${key}=${docExample[key as keyof typeof docExample]}`)
      .join('&')
    
    const docSignature = crypto
      .createHmac('sha256', 'WIbFEKre0s6sLnh4ei7SPUeYnptHG6V')
      .update(docSortedParams)
      .digest('hex')
    
    console.log('Documentation example parameter string:', docSortedParams)
    console.log('Documentation example signature:', docSignature)
    console.log('Expected signature from docs:', '07c13b65e037faf3b153d51613638fa80003c4c38d2407379a7f52851af1473e')
    console.log('Signature matches documentation:', docSignature === '07c13b65e037faf3b153d51613638fa80003c4c38d2407379a7f52851af1473e')
    
    return NextResponse.json({
      success: true,
      actualRequest: {
        url,
        status: response.status,
        success: response.ok && responseData.code === '0',
        data: responseData
      },
      verificationTest: {
        sortedParams: docSortedParams,
        generatedSignature: docSignature,
        expectedSignature: '07c13b65e037faf3b153d51613638fa80003c4c38d2407379a7f52851af1473e',
        matches: docSignature === '07c13b65e037faf3b153d51613638fa80003c4c38d2407379a7f52851af1473e'
      },
      debug: {
        timestamp,
        nonce,
        sortedParams,
        signature
      }
    })

  } catch (error: any) {
    console.error('=== Official Format Test Error ===')
    console.error('Error:', error)

    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error occurred'
    }, { status: 500 })
  }
}