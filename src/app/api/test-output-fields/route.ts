import { NextResponse } from 'next/server'
import { EcoFlowAPI } from '@/lib/ecoflow-api'

export async function GET() {
  try {
    console.log('🔍 Testing quota fields for total output calculation...')
    
    const api = new EcoFlowAPI({
      accessKey: process.env.ECOFLOW_ACCESS_KEY!,
      secretKey: process.env.ECOFLOW_SECRET_KEY!,
    })

    const deviceSn = 'R331ZKB5SG7V0293' // Your DELTA 2
    const quota = await api.getDeviceQuota(deviceSn)
    
    if (!quota || !quota.quotaMap) {
      return NextResponse.json({ error: 'No quota data found' }, { status: 404 })
    }

    // Extract output-related fields
    const outputFields: Record<string, any> = {}
    Object.keys(quota.quotaMap).forEach(key => {
      if (key.includes('Watts') || key.includes('watts') || key.includes('output') || key.includes('Output')) {
        outputFields[key] = quota.quotaMap[key]
      }
    })

    console.log('📊 Output-related quota fields:')
    console.log(JSON.stringify(outputFields, null, 2))

    return NextResponse.json({
      message: 'Output fields analysis',
      deviceSn,
      outputFields,
      // Key fields we're checking
      analysis: {
        'inv.outputWatts': quota.quotaMap['inv.outputWatts'] || 'Not found',
        'pd.wattsOutSum': quota.quotaMap['pd.wattsOutSum'] || 'Not found',
        'pd.usb1Watts': quota.quotaMap['pd.usb1Watts'] || 'Not found',
        'pd.usb2Watts': quota.quotaMap['pd.usb2Watts'] || 'Not found',
        'pd.typec1Watts': quota.quotaMap['pd.typec1Watts'] || 'Not found',
        'pd.typec2Watts': quota.quotaMap['pd.typec2Watts'] || 'Not found',
        'pd.carWatts': quota.quotaMap['pd.carWatts'] || 'Not found',
        'pd.qcUsb1Watts': quota.quotaMap['pd.qcUsb1Watts'] || 'Not found',
        'pd.qcUsb2Watts': quota.quotaMap['pd.qcUsb2Watts'] || 'Not found',
      }
    })

  } catch (error) {
    console.error('❌ Error testing quota fields:', error)
    return NextResponse.json({
      error: 'Failed to test quota fields',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}