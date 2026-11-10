'use client'

import { useRef, useState, type FormEvent } from 'react'
import { ConvexError } from 'convex/values'
import { CirclePlus, Power, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { PillButton } from '@/components/ui/PillButton'
import { useMeterActions, type MockMeter } from '@/hooks/useMockMeters'
import { formatMoney } from './meter-format'

const rechargePresets = ['5', '10', '25']
const maximumRechargeKwh = 1_000

type Operation = 'recharge' | 'deactivate' | 'reactivate' | 'simulate'

function getUnitsWh(value: string) {
  if (!/^\d+(\.\d{1,3})?$/.test(value)) return 0
  const units = Number(value)
  return units > 0 && units <= maximumRechargeKwh ? Math.round(units * 1_000) : 0
}

export default function MeterControls({ meter }: { meter: MockMeter }) {
  const { topUp, setManualHold, simulateUsage } = useMeterActions()
  const [units, setUnits] = useState('10')
  const [pending, setPending] = useState<Operation | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const pendingRef = useRef(false)
  const retryKeys = useRef(new Map<string, string>())
  const unitsWh = getUnitsWh(units)
  const suspended = meter.deactivationReason === 'manual'

  async function run(operation: Operation, rechargeWh = 0) {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(operation)
    setFailure(null)

    const key = operation === 'recharge' ? `recharge:${rechargeWh}` : operation
    const requestId = retryKeys.current.get(key) ?? crypto.randomUUID()
    retryKeys.current.set(key, requestId)
    const args = { meterId: meter.id, requestId }

    try {
      if (operation === 'recharge') {
        const result = await topUp({ ...args, unitsWh: rechargeWh })
        toast.success('Mock recharge recorded', {
          description: result.activated ? 'Supply is active.' : 'Admin suspension remains in place.',
        })
      } else if (operation === 'simulate') {
        const result = await simulateUsage({ ...args, unitsWh: 1_000 })
        toast.success(result.balanceWh === 0 ? 'Balance exhausted · supply deactivated' : 'Simulated usage recorded')
      } else {
        await setManualHold({ ...args, held: operation === 'deactivate' })
        setConfirming(false)
        toast.success(operation === 'deactivate' ? 'Supply suspended' : 'Supply reactivated')
      }
      retryKeys.current.delete(key)
    } catch (error) {
      const message = error instanceof ConvexError && typeof error.data === 'string'
        ? error.data
        : 'The meter could not be updated. Try again.'
      setFailure(message)
    } finally {
      pendingRef.current = false
      setPending(null)
    }
  }

  function recharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (unitsWh === 0) {
      setFailure('Enter between 0.001 and 1,000 kWh, with up to three decimal places.')
      return
    }
    void run('recharge', unitsWh)
  }

  const amount = Math.round(unitsWh * meter.tariffKoboPerKwh / 1_000)

  return (
    <section className="space-y-4" aria-label="Meter controls">
      <Card hover={false} className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <CirclePlus size={18} className="text-brand-primary" aria-hidden="true" />
          <h2 className="text-lg font-medium">Recharge meter</h2>
        </div>
        <form onSubmit={recharge} className="space-y-4">
          <label className="block text-sm text-text-secondary" htmlFor="recharge-units">Energy to add (kWh)</label>
          <input
            id="recharge-units"
            value={units}
            onChange={(event) => setUnits(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            className="min-h-11 w-full rounded-inner border border-stroke-strong bg-surface-2 px-3 text-text-primary"
            disabled={pending !== null}
          />
          <div className="flex flex-wrap gap-2" aria-label="Recharge presets">
            {rechargePresets.map((preset) => (
              <PillButton
                key={preset}
                aria-pressed={units === preset}
                className={units === preset ? 'min-h-11 border-brand-primary text-brand-primary' : 'min-h-11'}
                onClick={() => setUnits(preset)}
                disabled={pending !== null}
              >
                {preset} kWh
              </PillButton>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-stroke-subtle pt-3 text-sm">
            <span className="text-text-muted">Mock charge</span>
            <span className="font-medium tabular-nums">{unitsWh ? formatMoney(amount) : '—'}</span>
          </div>
          <p className="text-xs text-text-muted">Demo tariff {formatMoney(meter.tariffKoboPerKwh)} per kWh</p>
          <PillButton type="submit" variant="filled" className="min-h-11 w-full text-sm" disabled={pending !== null}>
            {pending === 'recharge' ? 'Recharging…' : 'Record mock recharge'}
          </PillButton>
        </form>
      </Card>

      <Card hover={false} className="p-5">
        <div className="mb-2 flex items-center gap-2.5">
          <Power size={18} className="text-text-secondary" aria-hidden="true" />
          <h2 className="text-lg font-medium">Supply control</h2>
        </div>
        <p className="mb-4 text-sm text-text-muted">
          {suspended
            ? 'An admin suspended this meter. Recharging adds credit while the suspension stays in place.'
            : meter.isActive
              ? 'Supply is active. An admin can suspend it at any time.'
              : 'This meter has used its credit. Recharge to restore supply.'}
        </p>
        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">Suspend supply for {meter.meterNumber}?</p>
            <div className="flex flex-wrap gap-2">
              <PillButton variant="danger" className="min-h-11" disabled={pending !== null} onClick={() => void run('deactivate')}>
                {pending === 'deactivate' ? 'Suspending…' : 'Confirm suspension'}
              </PillButton>
              <PillButton variant="ghost" className="min-h-11" disabled={pending !== null} onClick={() => setConfirming(false)}>Cancel</PillButton>
            </div>
          </div>
        ) : suspended ? (
          <PillButton className="min-h-11" disabled={pending !== null || meter.balanceWh === 0} onClick={() => void run('reactivate')}>
            {pending === 'reactivate' ? 'Reactivating…' : 'Reactivate supply'}
          </PillButton>
        ) : (
          <PillButton variant="danger" className="min-h-11" disabled={pending !== null || !meter.isActive} onClick={() => setConfirming(true)}>
            Deactivate supply
          </PillButton>
        )}
        {suspended && meter.balanceWh === 0 && <p className="mt-2 text-xs text-warning">Add credit before reactivating.</p>}
      </Card>

      <Card hover={false} className="p-5">
        <div className="mb-2 flex items-center gap-2.5">
          <Zap size={18} className="text-warning" aria-hidden="true" />
          <h2 className="text-lg font-medium">Simulation</h2>
        </div>
        <p className="mb-4 text-sm text-text-muted">Apply up to 1 kWh of simulated usage to see how the balance and supply respond.</p>
        <PillButton className="min-h-11" disabled={pending !== null || !meter.isActive} onClick={() => void run('simulate')}>
          {pending === 'simulate' ? 'Applying usage…' : 'Simulate 1 kWh'}
        </PillButton>
      </Card>
      {failure && (
        <p role="alert" className="rounded-inner border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{failure}</p>
      )}
    </section>
  )
}
