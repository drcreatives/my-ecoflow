'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PillButton } from '@/components/ui/PillButton'

export default function MeterError({ reset }: { reset: () => void }) {
  return (
    <Card className="py-12 text-center" hover={false}>
      <AlertCircle className="mx-auto mb-3 text-warning" aria-hidden="true" />
      <h1 className="text-xl font-medium">Unable to load meter data</h1>
      <p className="mt-2 text-sm text-text-muted">Try again or return to the meter fleet.</p>
      <div className="mt-5 flex items-center justify-center gap-4">
        <PillButton onClick={reset}>Try again</PillButton>
        <Link className="text-sm text-brand-primary hover:underline" href="/meters">Meter fleet</Link>
      </div>
    </Card>
  )
}
