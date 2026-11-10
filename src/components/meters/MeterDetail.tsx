'use client'

import Link from 'next/link'
import { Activity, ArrowLeft, BatteryCharging, Gauge, Loader2, MapPin, ReceiptText } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Id } from '../../../convex/_generated/dataModel'
import { Card } from '@/components/ui/Card'
import { useMeterDetail, type MockMeterDetail } from '@/hooks/useMockMeters'
import { axisStyle, chartColors, gridStyle } from '@/lib/chart-theme'
import { formatEnergy, formatMoney, formatPower } from './meter-format'
import { MeterStatus } from './MeterStatus'
import MeterControls from './MeterControls'

const shortTime = new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' })
const fullTime = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })

function LoadChart({ readings }: { readings: MockMeterDetail['readings'] }) {
  return (
    <Card hover={false} className="p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Load history</h2>
          <p className="mt-1 text-sm text-text-muted">Recent simulated power readings</p>
        </div>
        <Activity size={20} className="mt-1 text-brand-primary" aria-hidden="true" />
      </div>
      {readings.length > 1 ? (
        <div className="h-64 min-w-0" aria-label="Simulated meter load in watts over time">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={readings} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="meter-load" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={chartColors.battery} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={chartColors.battery} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridStyle} vertical={false} />
              <XAxis dataKey="recordedAt" type="number" scale="time" domain={['dataMin', 'dataMax']} {...axisStyle} tickFormatter={(value: number) => shortTime.format(value)} minTickGap={32} />
              <YAxis {...axisStyle} width={54} unit=" W" />
              <Tooltip
                labelFormatter={(value) => fullTime.format(Number(value))}
                formatter={(value) => [formatPower(Number(value)), 'Load']}
                contentStyle={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-stroke-subtle)', borderRadius: 12 }}
              />
              <Area type="linear" dataKey="loadWatts" stroke={chartColors.battery} fill="url(#meter-load)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="grid min-h-44 place-items-center text-sm text-text-muted">Load readings will appear as the simulator runs.</p>
      )}
    </Card>
  )
}

function MeterActivity({ events }: { events: MockMeterDetail['events'] }) {
  return (
    <Card hover={false} className="p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Activity</h2>
          <p className="mt-1 text-sm text-text-muted">Recent recharges and supply changes</p>
        </div>
        <ReceiptText size={19} className="text-text-muted" aria-hidden="true" />
      </div>
      {events.length ? (
        <ul className="divide-y divide-stroke-subtle">
          {events.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{event.message}</p>
                <time className="text-xs text-text-muted" dateTime={new Date(event.createdAt).toISOString()}>
                  {fullTime.format(event.createdAt)}
                </time>
              </div>
              <div className="shrink-0 text-right text-xs tabular-nums text-text-muted">
                {event.amountKobo > 0 && <p className="font-medium text-text-primary">{formatMoney(event.amountKobo)}</p>}
                <p>{formatEnergy(event.balanceWh)} left</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-5 text-sm text-text-muted">Meter activity will appear here.</p>
      )}
    </Card>
  )
}

export default function MeterDetail({ meterId }: { meterId: Id<'mockMeters'> }) {
  const detail = useMeterDetail(meterId)

  if (detail === undefined) {
    return <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-text-muted"><Loader2 className="animate-spin text-brand-primary" aria-hidden="true" /> Loading meter…</div>
  }

  if (!detail) {
    return (
      <Card hover={false} className="py-12 text-center">
        <h1 className="text-xl font-medium">Meter unavailable</h1>
        <Link className="mt-4 inline-flex text-sm text-brand-primary hover:underline" href="/meters">Return to meter fleet</Link>
      </Card>
    )
  }

  const { meter, readings, events } = detail
  const online = meter.connectivity === 'online'
  const creditShare = meter.purchasedWh > 0 ? Math.min(100, 100 * meter.balanceWh / meter.purchasedWh) : 0
  const metrics = [
    { label: 'Current load', value: online ? formatPower(meter.loadWatts) : 'Unavailable', note: online ? 'Simulated reading' : 'Offline · telemetry stale' },
    { label: 'Energy purchased', value: formatEnergy(meter.purchasedWh), note: `${formatMoney(meter.paidKobo)} mock payments` },
    { label: 'Energy consumed', value: formatEnergy(meter.usedWh), note: 'Lifetime usage' },
  ]

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/meters" className="inline-flex min-h-11 items-center gap-2 rounded-inner text-sm text-text-secondary hover:text-text-primary">
        <ArrowLeft size={16} aria-hidden="true" /> All meters
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.16em] text-brand-primary">
            <Gauge size={16} aria-hidden="true" /> METER DETAILS
          </p>
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{meter.customerName}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
            <span className="tabular-nums">{meter.meterNumber}</span>
            <span className="flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" />{meter.location}</span>
          </p>
        </div>
        <MeterStatus connectivity={meter.connectivity} isActive={meter.isActive} deactivationReason={meter.deactivationReason} />
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          <Card variant="accent" hover={false} className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium text-text-secondary">Remaining credit</h2>
                <p className="mt-1 text-4xl font-medium tracking-tight tabular-nums">
                  {formatEnergy(meter.balanceWh)}
                </p>
              </div>
              <span className="grid size-10 place-items-center rounded-inner bg-brand-primary/10 text-brand-primary">
                <BatteryCharging size={21} aria-hidden="true" />
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-pill bg-surface-2" aria-hidden="true">
              <div className="h-full rounded-pill bg-brand-primary" style={{ width: `${creditShare}%` }} />
            </div>
          </Card>
          <div className="grid gap-3 sm:grid-cols-3">
            {metrics.map(({ label, value, note }) => (
              <Card key={label} hover={false} className="min-w-0">
                <h2 className="text-sm text-text-secondary">{label}</h2>
                <p className="mt-2 text-xl font-medium tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-text-muted">{note}</p>
              </Card>
            ))}
          </div>
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <MeterControls meter={meter} />
        </div>
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
          <LoadChart readings={readings} />
          <MeterActivity events={events} />
        </div>
      </div>
    </div>
  )
}
