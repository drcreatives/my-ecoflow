import { NextRequest, NextResponse } from 'next/server'
import { ecoflowAPI } from '@/lib/ecoflow-api'
import { executeQuery } from '@/lib/database'

/**
 * Debug endpoint to test AC/DC/USB transformation and storage
 */
export async function GET(_request: NextRequest) {
  try {
    console.log('🔍 [DEBUG] Testing AC/DC/USB transformation and storage...')
    
    // Get raw quota data for our device
    const deviceSN = 'R331ZKB5SG7V0293'
    const quota = await ecoflowAPI.getDeviceQuota(deviceSN)
    
    if (!quota || !quota.quotaMap) {
      return NextResponse.json({ error: 'No quota data found' })
    }

    // Transform to reading format
    const reading = ecoflowAPI.transformQuotaToReading(quota, 'test-device-id')
    
    console.log('🔍 [DEBUG] Raw quota values:', {
      'inv.outputWatts': quota.quotaMap['inv.outputWatts']?.val,
      'pd.carWatts': quota.quotaMap['pd.carWatts']?.val,
      'pd.typec1Watts': quota.quotaMap['pd.typec1Watts']?.val,
      'pd.usb1Watts': quota.quotaMap['pd.usb1Watts']?.val,
    })
    
    console.log('🔍 [DEBUG] Transformed values:', {
      acOutputWatts: reading?.acOutputWatts,
      dcOutputWatts: reading?.dcOutputWatts,
      usbOutputWatts: reading?.usbOutputWatts,
      outputWatts: reading?.outputWatts,
    })
    
    if (!reading) {
      return NextResponse.json({ error: 'Failed to transform reading' })
    }

    // Test inserting with explicit values
    console.log('🔍 [DEBUG] SQL Parameters:', [
      'test-device-id',
      reading.batteryLevel || 0,
      reading.inputWatts || 0,
      reading.outputWatts || 0,
      reading.acOutputWatts || 0,
      reading.dcOutputWatts || 0,
      reading.usbOutputWatts || 0,
      reading.remainingTime,
      reading.temperature || 0,
      reading.status || 'unknown',
    ])

    // Verify that the values are numbers
    const acValue = reading.acOutputWatts || 0
    const dcValue = reading.dcOutputWatts || 0
    const usbValue = reading.usbOutputWatts || 0
    
    console.log('🔍 [DEBUG] Value types:', {
      acOutputWatts: { value: acValue, type: typeof acValue, isNumber: typeof acValue === 'number' },
      dcOutputWatts: { value: dcValue, type: typeof dcValue, isNumber: typeof dcValue === 'number' },
      usbOutputWatts: { value: usbValue, type: typeof usbValue, isNumber: typeof usbValue === 'number' },
    })
    
    return NextResponse.json({
      success: true,
      data: {
        rawQuota: {
          'inv.outputWatts': quota.quotaMap['inv.outputWatts']?.val,
          'pd.carWatts': quota.quotaMap['pd.carWatts']?.val,
          'pd.typec1Watts': quota.quotaMap['pd.typec1Watts']?.val,
        },
        transformedReading: {
          acOutputWatts: reading.acOutputWatts,
          dcOutputWatts: reading.dcOutputWatts,
          usbOutputWatts: reading.usbOutputWatts,
          outputWatts: reading.outputWatts,
        },
        valueTypes: {
          acOutputWatts: { value: acValue, type: typeof acValue },
          dcOutputWatts: { value: dcValue, type: typeof dcValue },
          usbOutputWatts: { value: usbValue, type: typeof usbValue },
        }
      }
    })

  } catch (error) {
    console.error('❌ Error in debug test:', error)
    
    return NextResponse.json({
      error: 'Failed to test transformation',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}