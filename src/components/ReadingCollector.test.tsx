import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CollectionStatusControl from './ReadingCollector'

const mocks = vi.hoisted(() => ({
  useConvexDevices: vi.fn(),
  useConvexSettings: vi.fn(),
}))
vi.mock('@/hooks/useConvexData', () => mocks)

describe('collection status', () => {
  beforeEach(() => {
    mocks.useConvexDevices.mockReturnValue({
      devices: [{ isActive: true, currentReading: { recordedAt: Date.now() - 15 * 60_000 } }],
    })
    mocks.useConvexSettings.mockReturnValue({ dataRetention: { collectionIntervalMinutes: 10 } })
  })

  it('shows the configured collection cadence and identifies an old reading', () => {
    render(<CollectionStatusControl />)
    fireEvent.click(screen.getByRole('button', { name: 'Show Collection Status' }))
    expect(screen.getByText('10 minutes')).toBeInTheDocument()
    expect(screen.getByText(/15m ago.*stale/i)).toBeInTheDocument()
    expect(screen.getByText(/device measurement time is unavailable/i)).toBeInTheDocument()
  })

  it('does not call the last metadata update a reading', () => {
    mocks.useConvexDevices.mockReturnValue({ devices: [{ isActive: true, updatedAt: Date.now(), currentReading: null }] })
    render(<CollectionStatusControl />)
    fireEvent.click(screen.getByRole('button', { name: 'Show Collection Status' }))
    expect(screen.getByText('Never')).toBeInTheDocument()
  })
})
