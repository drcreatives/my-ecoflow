'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ChevronDown,
  Database,
  Gauge,
  Loader2,
  MapPin,
  Power,
  Search,
  SlidersHorizontal,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { PillButton } from '@/components/ui/PillButton'
import { MeterStatus } from '@/components/meters/MeterStatus'
import { MeterBalance } from '@/components/meters/MeterBalance'
import { formatEnergy, formatPower, LOW_BALANCE_WH } from '@/components/meters/meter-format'
import { useMeterFleet, useSeedMeters, type MockMeter } from '@/hooks/useMockMeters'

interface SummaryCardProps {
  label: string
  value: string
  caption: string
  icon: ReactNode
}

function SummaryCard({ label, value, caption, icon }: SummaryCardProps) {
  return (
    <Card hover={false} className="relative overflow-hidden p-5">
      <div className="mb-5 flex items-center justify-between gap-2">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-inner bg-surface-2 text-brand-primary">{icon}</span>
      </div>
      <p className="text-3xl font-medium tracking-tight text-text-primary tabular-nums">{value}</p>
      <p className="mt-2 text-xs text-text-muted">{caption}</p>
    </Card>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}

function FilterSelect({ label, value, onChange, children }: FilterSelectProps) {
  return (
    <label className="relative min-w-0 flex-1 sm:min-w-[145px]">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-inner border border-stroke-subtle bg-surface-2 py-2 pl-3 pr-9 text-sm text-text-primary outline-none transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
    </label>
  )
}

interface MeterCardProps {
  meter: MockMeter
}

function MeterCard({ meter }: MeterCardProps) {
  return (
    <Card hover={false} className="p-4">
      <Link href={`/meters/${meter.id}`} className="mb-3 flex items-center justify-between gap-3 rounded-inner focus-visible:outline-2 focus-visible:outline-brand-primary">
        <div>
          <h3 className="font-medium text-text-primary">{meter.customerName}</h3>
          <p className="mt-1 text-xs text-text-muted">{meter.meterNumber}</p>
        </div>
        <ArrowRight size={18} className="text-text-secondary" aria-hidden="true" />
      </Link>
      <MeterStatus
        connectivity={meter.connectivity}
        isActive={meter.isActive}
        deactivationReason={meter.deactivationReason}
      />
      <p className="mt-3 flex items-center gap-1.5 text-xs text-text-secondary">
        <MapPin size={12} aria-hidden="true" />
        {meter.location}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-stroke-subtle pt-4">
        <div>
          <p className="mb-1.5 text-[11px] text-text-muted">Available units</p>
          <MeterBalance balanceWh={meter.balanceWh} purchasedWh={meter.purchasedWh} />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] text-text-muted">Current load</p>
          <p className="text-sm font-medium text-text-primary">
            {meter.connectivity === 'online' ? formatPower(meter.isActive ? meter.loadWatts : 0) : '—'}
          </p>
          <p className="mt-1 text-[11px] text-text-muted">{formatEnergy(meter.usedWh)} used</p>
        </div>
      </div>
    </Card>
  )
}

export default function MetersPage() {
  const { meters, isLoading } = useMeterFleet()
  const seedMeters = useSeedMeters()
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('all')
  const [connectivity, setConnectivity] = useState('all')
  const [activation, setActivation] = useState('all')
  const [page, setPage] = useState(1)
  const [isSeeding, setIsSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const pageSize = 10

  const locations = useMemo(() => Array.from(new Set(meters.map(meter => meter.location))).sort(), [meters])
  const filteredMeters = useMemo(() => {
    const query = search.trim().toLowerCase()
    return meters.filter(meter => (
      (!query || `${meter.customerName} ${meter.meterNumber} ${meter.location}`.toLowerCase().includes(query)) &&
      (location === 'all' || meter.location === location) &&
      (connectivity === 'all' || meter.connectivity === connectivity) &&
      (activation === 'all' || meter.isActive === (activation === 'active'))
    ))
  }, [meters, search, location, connectivity, activation])
  const activeCount = meters.filter(meter => meter.isActive).length
  const onlineCount = meters.filter(meter => meter.connectivity === 'online').length
  const lowBalanceCount = meters.filter(meter => meter.balanceWh <= LOW_BALANCE_WH).length
  const loadWatts = meters.reduce((sum, meter) => sum + (meter.isActive && meter.connectivity === 'online' ? meter.loadWatts : 0), 0)
  const pageCount = Math.max(1, Math.ceil(filteredMeters.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleMeters = filteredMeters.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasFilters = Boolean(search || location !== 'all' || connectivity !== 'all' || activation !== 'all')

  function clearFilters() {
    setSearch('')
    setLocation('all')
    setConnectivity('all')
    setActivation('all')
    setPage(1)
  }

  async function handleSeed() {
    setIsSeeding(true)
    setSeedError(null)
    try {
      const result = await seedMeters({})
      toast.success(result.created ? 'Your demo meters are ready' : 'Demo meters are already available')
    } catch {
      const message = 'Unable to create demo meters. Please try again.'
      setSeedError(message)
      toast.error(message)
    } finally {
      setIsSeeding(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-7 pb-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 text-[10px] font-medium tracking-[0.2em] text-brand-primary">POWER OPERATIONS</p>
          <h1 className="text-[28px] font-medium tracking-tight text-text-primary sm:text-page-title">Meter overview</h1>
          <p className="mt-2 text-sm text-text-secondary">A clear view of your network, usage, and prepaid balances.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-pill border border-stroke-strong bg-surface-1 px-3.5 py-2 text-xs text-text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
          Mock meter network
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-[18px]" aria-label="Fleet summary">
        <SummaryCard label="Total meters" value={isLoading ? '—' : String(meters.length)} caption={`${onlineCount} online · ${meters.length - onlineCount} offline`} icon={<Gauge size={17} />} />
        <SummaryCard label="Supply activated" value={isLoading ? '—' : String(activeCount)} caption={`${meters.length - activeCount} deactivated`} icon={<Power size={17} />} />
        <SummaryCard label="Low unit balance" value={isLoading ? '—' : String(lowBalanceCount)} caption="5 kWh or less remaining" icon={<Wallet size={17} />} />
        <SummaryCard label="Current network load" value={isLoading ? '—' : formatPower(loadWatts)} caption="Across online, activated meters" icon={<Zap size={17} />} />
      </div>

      <section aria-labelledby="meters-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h2 id="meters-heading" className="text-base font-medium text-text-primary">Your meters</h2>
            <span className="rounded-pill border border-stroke-subtle bg-surface-1 px-2 py-0.5 text-[11px] text-text-secondary">{meters.length}</span>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-text-muted sm:flex"><Activity size={13} aria-hidden="true" />Updates automatically</span>
        </div>

        <Card hover={false} className="flex flex-col gap-3 p-3 lg:flex-row">
          <label className="relative flex-1 lg:min-w-[220px]">
            <span className="sr-only">Search meters</span>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Search name, meter, or location" className="h-11 w-full rounded-inner border border-stroke-subtle bg-surface-2 pl-10 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex">
            <FilterSelect label="Filter by location" value={location} onChange={value => { setLocation(value); setPage(1) }}>
              <option value="all">All locations</option>
              {locations.map(value => <option key={value} value={value}>{value}</option>)}
            </FilterSelect>
            <FilterSelect label="Filter by connection" value={connectivity} onChange={value => { setConnectivity(value); setPage(1) }}>
              <option value="all">All connections</option><option value="online">Online</option><option value="offline">Offline</option>
            </FilterSelect>
            <FilterSelect label="Filter by activation" value={activation} onChange={value => { setActivation(value); setPage(1) }}>
              <option value="all">All supply states</option><option value="active">Activated</option><option value="inactive">Deactivated</option>
            </FilterSelect>
          </div>
        </Card>

        {hasFilters && <div className="flex items-center justify-between gap-3 px-1 text-xs"><span className="text-text-secondary" role="status">{filteredMeters.length} matching {filteredMeters.length === 1 ? 'meter' : 'meters'}</span><button onClick={clearFilters} className="rounded-pill px-3 py-1.5 text-brand-primary hover:bg-brand-primary/10 focus-visible:outline-2 focus-visible:outline-brand-primary">Clear filters</button></div>}

        {isLoading ? (
          <Card hover={false} className="flex min-h-64 flex-col items-center justify-center gap-3" role="status">
            <Loader2 className="animate-spin text-brand-primary" size={24} aria-hidden="true" /><p className="text-sm text-text-secondary">Loading your meter network…</p>
          </Card>
        ) : meters.length === 0 ? (
          <Card hover={false} className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-card border border-brand-primary/20 bg-brand-primary/10 text-brand-primary"><Database size={24} /></div>
            <div><h3 className="text-lg font-medium text-text-primary">Bring your demo network online</h3><p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">Create 50 mock meters with customers, locations, balances, and usage history.</p></div>
            <PillButton variant="filled" disabled={isSeeding} onClick={() => void handleSeed()} className="flex min-h-11 items-center gap-2 px-5">{isSeeding ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}{isSeeding ? 'Creating demo meters…' : 'Create 50 demo meters'}</PillButton>
            {seedError && <p role="alert" className="text-sm text-danger">{seedError}</p>}
          </Card>
        ) : filteredMeters.length === 0 ? (
          <Card hover={false} className="flex min-h-64 flex-col items-center justify-center gap-3 text-center"><SlidersHorizontal size={28} className="text-text-muted" /><h3 className="font-medium text-text-primary">No meters match these filters</h3><p className="text-sm text-text-secondary">Adjust the search or clear filters to see your network.</p><PillButton onClick={clearFilters}>Clear filters</PillButton></Card>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-card border border-stroke-subtle bg-surface-1 lg:block" role="region" aria-label="Meters table" tabIndex={0}>
              <table className="w-full border-collapse text-left">
                <thead><tr className="border-b border-stroke-subtle bg-surface-2/40 text-[10px] uppercase tracking-wider text-text-muted"><th scope="col" className="px-5 py-4 font-medium">Customer / Meter</th><th scope="col" className="px-4 py-4 font-medium">Location</th><th scope="col" className="px-4 py-4 font-medium">Status</th><th scope="col" className="px-4 py-4 font-medium">Available units</th><th scope="col" className="px-4 py-4 font-medium">Usage</th><th scope="col" className="px-4 py-4 font-medium">Current load</th><th scope="col" className="px-4 py-4"><span className="sr-only">Details</span></th></tr></thead>
                <tbody>{visibleMeters.map(meter => (
                  <tr key={meter.id} className="border-b border-stroke-subtle last:border-0 hover:bg-surface-2/40">
                    <td className="px-5 py-5"><Link href={`/meters/${meter.id}`} className="flex items-center gap-3 rounded-inner focus-visible:outline-2 focus-visible:outline-brand-primary"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-inner border border-stroke-subtle bg-surface-2 text-text-secondary"><Gauge size={17} /></span><span><span className="block text-sm font-medium text-text-primary">{meter.customerName}</span><span className="mt-1 block text-[11px] text-text-muted">{meter.meterNumber}</span></span></Link></td>
                    <td className="px-4 py-5 text-xs text-text-secondary">{meter.location}</td>
                    <td className="px-4 py-5"><MeterStatus connectivity={meter.connectivity} isActive={meter.isActive} deactivationReason={meter.deactivationReason} /></td>
                    <td className="px-4 py-5"><MeterBalance balanceWh={meter.balanceWh} purchasedWh={meter.purchasedWh} /></td>
                    <td className="px-4 py-5"><p className="text-xs text-text-primary tabular-nums">{formatEnergy(meter.usedWh)} used</p><p className="mt-1 text-[10px] text-text-muted">{formatEnergy(meter.purchasedWh)} purchased</p></td>
                    <td className="px-4 py-5 text-sm text-text-primary tabular-nums">{meter.connectivity === 'online' ? formatPower(meter.isActive ? meter.loadWatts : 0) : <span className="text-text-muted" title="Meter is offline">—</span>}</td>
                    <td className="px-4 py-5"><Link href={`/meters/${meter.id}`} aria-label={`View ${meter.customerName}'s meter`} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stroke-subtle text-text-secondary transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/10 hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-brand-primary"><ArrowRight size={15} /></Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:hidden" role="region" aria-label="Meter cards">{visibleMeters.map(meter => <MeterCard key={meter.id} meter={meter} />)}</div>
            <div className="flex flex-col items-center justify-between gap-3 px-1 sm:flex-row">
              <p className="text-xs text-text-muted">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredMeters.length)} of {filteredMeters.length} meters</p>
              <div className="flex items-center gap-3"><PillButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="min-h-9">Previous</PillButton><span className="text-xs text-text-secondary">{currentPage} / {pageCount}</span><PillButton disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="min-h-9">Next</PillButton></div>
            </div>
          </>
        )}
      </section>

      <div className="flex flex-col gap-2 border-t border-stroke-subtle pt-4 text-[11px] text-text-muted sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-1.5"><Wifi size={12} />Connection and supply status are tracked independently.</span><span className="flex items-center gap-1.5"><ArrowDownLeft size={12} />Open a meter to recharge units or manage supply.</span></div>
    </div>
  )
}
