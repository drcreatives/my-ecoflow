'use client'

import { useId, useState } from 'react'
import { toast } from 'sonner'
import type { DcInputSource } from '@/types'

interface DcInputSourceSettingProps {
  value: DcInputSource
  onSave: (source: DcInputSource) => Promise<unknown>
}

export function DcInputSourceSetting({ value, onSave }: DcInputSourceSettingProps) {
  const inputId = useId()
  const descriptionId = `${inputId}-description`
  const [pendingSource, setPendingSource] = useState<DcInputSource | null>(null)

  const saveSource = async (source: DcInputSource) => {
    if (pendingSource !== null || source === value) return
    setPendingSource(source)
    try {
      await onSave(source)
      toast.success('DC input source saved for future readings')
    } catch {
      toast.error('Could not save the DC input source. Please try again.')
    } finally {
      setPendingSource(null)
    }
  }

  return (
    <div className="p-4 bg-surface-2/50 rounded-inner">
      <label htmlFor={inputId} className="block text-sm font-medium text-text-primary mb-2">
        DC input source
      </label>
      <p id={descriptionId} className="text-sm text-text-muted mb-3">
        Choose what is connected to XT60. This applies to new readings when the device does not report its DC source.
        {' '}Contradictory live readings remain flagged.
      </p>
      <select
        id={inputId}
        aria-describedby={descriptionId}
        aria-busy={pendingSource !== null}
        value={pendingSource ?? value}
        disabled={pendingSource !== null}
        onChange={event => { void saveSource(event.currentTarget.value as DcInputSource) }}
        className="w-full min-h-11 px-3 py-2 bg-surface-2 border border-stroke-subtle rounded-inner text-text-primary focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 focus:outline-none disabled:opacity-50"
      >
        <option value="auto">Automatic</option>
        <option value="solar">Solar panels</option>
        <option value="adapter">DC adapter</option>
      </select>
      {pendingSource !== null && <p role="status" className="text-xs text-text-muted mt-2">Saving DC input source…</p>}
    </div>
  )
}
