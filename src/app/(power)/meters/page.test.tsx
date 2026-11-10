import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MetersPage from './page'
import type { MockMeter } from '@/hooks/useMockMeters'

const mocks = vi.hoisted(() => ({
  meters: [] as MockMeter[],
  isLoading: false,
  seed: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/hooks/useMockMeters', () => ({
  useMeterFleet: () => ({ meters: mocks.meters, isLoading: mocks.isLoading }),
  useSeedMeters: () => mocks.seed,
}))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))

function meter(overrides: Partial<MockMeter> = {}): MockMeter {
  return {
    id: 'meter-one' as MockMeter['id'],
    meterNumber: 'PWR-001',
    customerName: 'Ada Demo',
    location: 'Lekki',
    connectivity: 'online',
    isActive: true,
    deactivationReason: null,
    balanceWh: 12_000,
    purchasedWh: 30_000,
    usedWh: 18_000,
    paidKobo: 600_000,
    tariffKoboPerKwh: 20_000,
    loadWatts: 600,
    lastSeenAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

beforeEach(() => {
  mocks.isLoading = false
  mocks.meters = [
    meter(),
    meter({ id: 'meter-two' as MockMeter['id'], meterNumber: 'PWR-002', customerName: 'Bisi Demo', location: 'Ikeja', connectivity: 'offline', isActive: false, deactivationReason: 'manual' }),
    meter({ id: 'meter-three' as MockMeter['id'], meterNumber: 'PWR-003', customerName: 'Chika Demo', location: 'Lekki', connectivity: 'online', isActive: false, deactivationReason: 'balance', balanceWh: 0, usedWh: 30_000 }),
  ]
  mocks.seed.mockReset().mockResolvedValue({ created: true, count: 50 })
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
})

describe('mock meter fleet', () => {
  it('combines location, connection, activation and search filters', async () => {
    const user = userEvent.setup()
    render(<MetersPage />)
    await user.selectOptions(screen.getByLabelText('Filter by location'), 'Lekki')
    await user.selectOptions(screen.getByLabelText('Filter by connection'), 'online')
    await user.selectOptions(screen.getByLabelText('Filter by activation'), 'inactive')
    await user.type(screen.getByLabelText('Search meters'), 'PWR-003')
    const table = within(screen.getByRole('region', { name: 'Meters table' }))
    expect(table.getByText('Chika Demo')).toBeInTheDocument()
    expect(table.queryByText('Ada Demo')).not.toBeInTheDocument()
    expect(table.queryByText('Bisi Demo')).not.toBeInTheDocument()
    expect(screen.getByText('1 matching meter')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(table.getByText('Ada Demo')).toBeInTheDocument()
    expect(table.getByText('Bisi Demo')).toBeInTheDocument()
  })

  it('displays connection independently from supply and distinguishes offline load', () => {
    render(<MetersPage />)
    const table = within(screen.getByRole('region', { name: 'Meters table' }))
    const offlineRow = within(table.getByText('Bisi Demo').closest('tr')!)
    expect(offlineRow.getByText('Offline')).toBeInTheDocument()
    expect(offlineRow.getByText('Deactivated')).toBeInTheDocument()
    expect(offlineRow.getByTitle('Meter is offline')).toHaveTextContent('—')
    const exhaustedRow = within(table.getByText('Chika Demo').closest('tr')!)
    expect(exhaustedRow.getByText('Online')).toBeInTheDocument()
    expect(exhaustedRow.getByText('Deactivated')).toBeInTheDocument()
    expect(exhaustedRow.getByText('Units exhausted')).toBeInTheDocument()
    expect(exhaustedRow.getByText('0 W')).toBeInTheDocument()
  })

  it('shows whole-fleet totals while filters narrow the displayed meters', async () => {
    const user = userEvent.setup()
    render(<MetersPage />)
    await user.type(screen.getByLabelText('Search meters'), 'Bisi')
    const summary = screen.getByLabelText('Fleet summary')
    expect(within(summary).getByText('600 W')).toBeInTheDocument()
    expect(within(summary).getByText('2 online · 1 offline')).toBeInTheDocument()
    expect(screen.getByText('1 matching meter')).toBeInTheDocument()
  })

  it('offers recovery when filters return no meters', async () => {
    const user = userEvent.setup()
    render(<MetersPage />)
    await user.type(screen.getByLabelText('Search meters'), 'missing meter')
    expect(screen.getByText('No meters match these filters')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
    expect(screen.getByRole('region', { name: 'Meters table' })).toBeInTheDocument()
  })

  it('paginates the fleet and resets the page after changing filters', async () => {
    const user = userEvent.setup()
    mocks.meters = Array.from({ length: 12 }, (_, index) => meter({ id: `meter-${index}` as MockMeter['id'], meterNumber: `PWR-${index}`, customerName: `Customer ${index}` }))
    render(<MetersPage />)
    expect(screen.getByText('Showing 1–10 of 12 meters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Showing 11–12 of 12 meters')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search meters'), 'Customer 0')
    expect(screen.getByText('Showing 1–1 of 1 meters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it('shows loading until the reactive fleet is available', () => {
    mocks.isLoading = true
    mocks.meters = []
    render(<MetersPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading your meter network')
    expect(screen.queryByRole('button', { name: 'Create 50 demo meters' })).not.toBeInTheDocument()
  })

  it('seeds only when requested and reports errors for retry', async () => {
    const user = userEvent.setup()
    mocks.meters = []
    mocks.seed.mockRejectedValueOnce(new Error('Temporary failure'))
    render(<MetersPage />)
    expect(mocks.seed).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Create 50 demo meters' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to create demo meters')
    await user.click(screen.getByRole('button', { name: 'Create 50 demo meters' }))
    expect(mocks.seed).toHaveBeenCalledTimes(2)
    expect(mocks.seed).toHaveBeenLastCalledWith({})
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Your demo meters are ready')
  })
})
