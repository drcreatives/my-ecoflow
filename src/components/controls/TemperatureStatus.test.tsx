import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTemperatureMetric } from '@/lib/display-telemetry'
import { TemperatureStatus } from './TemperatureStatus'

// Existing feature coverage remains runnable when temperature is re-enabled.
const temperatureFeature = vi.hoisted(() => ({ enabled: true }))
vi.mock('@/lib/features', () => ({ get TEMPERATURE_FEATURE_ENABLED() { return temperatureFeature.enabled } }))
beforeEach(() => { temperatureFeature.enabled = true })

describe('temperature status presentation', () => {
  it('should keep the card age short while exposing the exact report time to keyboard and assistive technology', async () => {
    const receivedAt = Date.now() - 120_000
    const metric = resolveTemperatureMetric({ value: 37, receivedAt, source: 'mqtt' })
    const user = userEvent.setup()
    render(<TemperatureStatus metric={metric} compact />)
    const age = screen.getByText('2 min ago')
    expect(age).toHaveAttribute('aria-label', metric.tooltip)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.tab()
    expect(age).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent(metric.tooltip!)
    expect(age).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.queryByText(metric.label)).not.toBeInTheDocument()
  })

  it('should visibly disclose and hide the exact report time on mouse hover', async () => {
    const metric = resolveTemperatureMetric({ value: 37, receivedAt: Date.now(), source: 'mqtt' })
    const user = userEvent.setup()
    render(<TemperatureStatus metric={metric} compact />)
    const age = screen.getByText('Just now')
    await user.hover(age)
    expect(screen.getByRole('tooltip')).toHaveTextContent(metric.tooltip!)
    await user.unhover(age)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('should use one short updating line on cards and preserve the exact report disclosure', () => {
    const metric = resolveTemperatureMetric({ value: 37, receivedAt: Date.now(), source: 'mqtt' })
    render(<TemperatureStatus metric={metric} refreshing compact />)
    expect(screen.getByRole('status')).toHaveTextContent('Updating…')
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', expect.stringContaining(metric.tooltip!))
    expect(screen.queryByText('Checking temperature…')).not.toBeInTheDocument()
    expect(screen.queryByText('Just now')).not.toBeInTheDocument()
  })

  it('should visibly mark a stale card value without a wrapping date', () => {
    const metric = resolveTemperatureMetric({ value: 37, receivedAt: Date.now() - 360_001, source: 'mqtt' })
    render(<TemperatureStatus metric={metric} compact />)
    expect(screen.getByText('Stale · 6m')).toHaveAttribute('aria-label', expect.stringContaining('Stale temperature.'))
  })

  it('should retain full report time and checking feedback in the detail presentation', () => {
    const metric = resolveTemperatureMetric({ value: 37, receivedAt: Date.now(), source: 'mqtt' })
    render(<TemperatureStatus metric={metric} refreshing />)
    expect(screen.getByText(metric.label)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Checking temperature…')
  })
})

it('should hide both compact and full temperature progress when paused', () => {
  temperatureFeature.enabled = false
  const metric = resolveTemperatureMetric({ value: 39, source: 'mqtt', receivedAt: Date.now() })
  const { container } = render(<><TemperatureStatus metric={metric} refreshing /><TemperatureStatus metric={metric} refreshing compact /></>)
  expect(container).toBeEmptyDOMElement()
})
