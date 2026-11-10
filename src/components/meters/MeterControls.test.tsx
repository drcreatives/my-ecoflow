import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockMeter } from '@/hooks/useMockMeters'
import MeterControls from './MeterControls'

const actions = vi.hoisted(() => ({
  topUp: vi.fn(),
  setManualHold: vi.fn(),
  simulateUsage: vi.fn(),
}))

vi.mock('@/hooks/useMockMeters', () => ({ useMeterActions: () => actions }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const meter: MockMeter = {
  id: 'test-meter' as MockMeter['id'],
  meterNumber: 'PWR-0001',
  customerName: 'Demo customer',
  location: 'Ikeja',
  connectivity: 'online',
  isActive: true,
  deactivationReason: null,
  balanceWh: 450,
  purchasedWh: 10_000,
  usedWh: 9_550,
  paidKobo: 200_000,
  tariffKoboPerKwh: 20_000,
  loadWatts: 120,
  lastSeenAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

beforeEach(() => {
  vi.resetAllMocks()
  actions.topUp.mockResolvedValue({ balanceWh: 10_450, activated: true, duplicate: false })
  actions.setManualHold.mockResolvedValue({ balanceWh: 450, activated: false, duplicate: false })
  actions.simulateUsage.mockResolvedValue({ balanceWh: 0, activated: false, duplicate: false })
})

describe('MeterControls', () => {
  it('validates energy and records a decimal recharge as integer Wh', async () => {
    const user = userEvent.setup()
    render(<MeterControls meter={meter} />)
    const units = screen.getByLabelText('Energy to add (kWh)')
    await user.clear(units)
    await user.type(units, '0.0001')
    await user.click(screen.getByRole('button', { name: 'Record mock recharge' }))
    expect(screen.getByRole('alert')).toHaveTextContent('up to three decimal places')
    expect(actions.topUp).not.toHaveBeenCalled()

    await user.clear(units)
    await user.type(units, '2.125')
    await user.click(screen.getByRole('button', { name: 'Record mock recharge' }))
    expect(actions.topUp).toHaveBeenCalledWith({ meterId: meter.id, unitsWh: 2_125, requestId: expect.any(String) })
  })

  it('reuses the request ID when a recharge is retried', async () => {
    actions.topUp.mockRejectedValueOnce(new Error('Connection lost'))
    const user = userEvent.setup()
    render(<MeterControls meter={meter} />)
    await user.click(screen.getByRole('button', { name: 'Record mock recharge' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record mock recharge' }))
    expect(actions.topUp).toHaveBeenCalledTimes(2)
    expect(actions.topUp.mock.calls[0][0]).toEqual(actions.topUp.mock.calls[1][0])
  })

  it('confirms manual suspension and lets a funded suspended meter reactivate', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MeterControls meter={meter} />)
    await user.click(screen.getByRole('button', { name: 'Deactivate supply' }))
    expect(actions.setManualHold).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm suspension' }))
    expect(actions.setManualHold).toHaveBeenCalledWith({ meterId: meter.id, held: true, requestId: expect.any(String) })

    rerender(<MeterControls meter={{ ...meter, isActive: false, deactivationReason: 'manual', balanceWh: 0 }} />)
    expect(screen.getByRole('button', { name: 'Reactivate supply' })).toBeDisabled()
    rerender(<MeterControls meter={{ ...meter, isActive: false, deactivationReason: 'manual' }} />)
    await user.click(screen.getByRole('button', { name: 'Reactivate supply' }))
    expect(actions.setManualHold).toHaveBeenLastCalledWith({ meterId: meter.id, held: false, requestId: expect.any(String) })
  })

  it('passes simulated energy to the backend and prevents usage on inactive meters', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MeterControls meter={meter} />)
    await user.click(screen.getByRole('button', { name: 'Simulate 1 kWh' }))
    expect(actions.simulateUsage).toHaveBeenCalledWith({ meterId: meter.id, unitsWh: 1_000, requestId: expect.any(String) })
    rerender(<MeterControls meter={{ ...meter, isActive: false, deactivationReason: 'balance', balanceWh: 0 }} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simulate 1 kWh' })).toBeDisabled())
  })
})
