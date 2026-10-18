import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Header } from './Header'

const mocks = vi.hoisted(() => ({
  useConvexConnectionState: vi.fn(),
  useConvexDevices: vi.fn(),
}))
vi.mock('convex/react', () => ({ useConvexConnectionState: mocks.useConvexConnectionState }))
vi.mock('@/hooks/useConvexData', () => ({
  useConvexDevices: mocks.useConvexDevices,
  useConvexProfile: () => ({ profile: null }),
}))
vi.mock('@/hooks/useBreakpoint', () => ({ useIsMobile: () => false }))
vi.mock('@/stores/uiStore', () => ({ useUIStore: () => ({ notifications: [], toggleSidebar: vi.fn() }) }))
vi.mock('@/components/LogoutButton', () => ({ default: () => null }))

describe('Header connection status', () => {
  beforeEach(() => {
    mocks.useConvexDevices.mockReturnValue({ devices: [{ isActive: true, readingFreshness: 'stale' }] })
    mocks.useConvexConnectionState.mockReturnValue({ isWebSocketConnected: true, hasEverConnected: true })
  })

  it('distinguishes an app connection from stale device readings', () => {
    render(<Header />)
    expect(screen.getByText('App connected')).toBeInTheDocument()
    expect(screen.getByText('1 reading stale')).toBeInTheDocument()
  })

  it('shows the actual lost app connection', () => {
    mocks.useConvexConnectionState.mockReturnValue({ isWebSocketConnected: false, hasEverConnected: true })
    render(<Header />)
    expect(screen.getByText('App reconnecting')).toBeInTheDocument()
    expect(screen.queryByText('App connected')).not.toBeInTheDocument()
  })
})
