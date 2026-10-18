import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { StrictMode } from 'react'
import SettingsPage from './page'

const mocks = vi.hoisted(() => ({
  dataRetention: {
    retentionPeriodDays: 90,
    autoCleanupEnabled: true,
    backupEnabled: true,
    backupIntervalHours: 168,
    collectionIntervalMinutes: 15,
    backupDestination: undefined as 'email' | 'googleDrive' | undefined,
  },
  updateDataRetention: vi.fn(),
  updateNotifications: vi.fn(),
  sendTestEmail: vi.fn(),
  googleDriveStatus: {
    configured: true,
    connected: false,
    reconnectRequired: false,
    connectedAt: null as number | null,
    folderUrl: null as string | null,
  } as { configured: boolean; connected: boolean; reconnectRequired: boolean; connectedAt: number | null; folderUrl: string | null } | null,
  googleDriveLoading: false,
  startGoogleDriveConnection: vi.fn(),
  finishGoogleDriveConnection: vi.fn(),
  disconnectGoogleDrive: vi.fn(),
  devices: [
    { id: 'device-a', deviceSn: 'TEST-A', deviceName: 'Station A', deviceType: 'Delta 2', isActive: true },
    { id: 'device-b', deviceSn: 'TEST-B', deviceName: 'Station B', deviceType: 'Delta 2', isActive: false },
  ],
  query: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/hooks/useConvexData', () => ({
  useConvexProfile: () => ({ profile: null, isLoading: false, updateProfile: vi.fn() }),
  useConvexSettings: () => ({
    dataRetention: mocks.dataRetention,
    notifications: null,
    isLoading: false,
    updateDataRetention: mocks.updateDataRetention,
    updateNotifications: mocks.updateNotifications,
    sendTestEmail: mocks.sendTestEmail,
    googleDriveStatus: mocks.googleDriveStatus,
    googleDriveLoading: mocks.googleDriveLoading,
    startGoogleDriveConnection: mocks.startGoogleDriveConnection,
    finishGoogleDriveConnection: mocks.finishGoogleDriveConnection,
    disconnectGoogleDrive: mocks.disconnectGoogleDrive,
  }),
  useConvexDevices: () => ({ devices: mocks.devices, isLoading: false }),
}))
vi.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signOut: vi.fn() }) }))
vi.mock('convex/react', () => ({ useConvex: () => ({ query: mocks.query }) }))
vi.mock('@/stores/uiStore', () => ({
  useUIStore: () => ({ notifications: [], clearAllNotifications: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))

beforeEach(() => {
  mocks.dataRetention.backupDestination = undefined
  mocks.dataRetention.backupEnabled = true
  mocks.googleDriveStatus = { configured: true, connected: false, reconnectRequired: false, connectedAt: null, folderUrl: null }
  mocks.googleDriveLoading = false
  window.sessionStorage.clear()
  window.history.replaceState({}, '', '/settings')
})

describe('settings retention selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateDataRetention.mockResolvedValue(null)
  })

  it.each([
    { option: '30 days', days: 30 },
    { option: '2 years', days: 730 },
  ])('should save the selected $option retention period', async ({ option, days }) => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))
    const retentionSelect = screen.getByRole('option', { name: '2 years' }).closest('select')!
    expect(retentionSelect).toHaveValue('90')

    await user.selectOptions(retentionSelect, screen.getByRole('option', { name: option }))
    await user.click(screen.getByRole('button', { name: 'Save Data Settings' }))

    expect(mocks.updateDataRetention).toHaveBeenCalledExactlyOnceWith({
      retentionPeriodDays: days,
      autoCleanupEnabled: true,
      backupEnabled: true,
      backupIntervalHours: 168,
      collectionIntervalMinutes: 15,
    })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Data settings updated successfully'))
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})

describe('complete settings downloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockReset()
    mocks.createObjectURL.mockReturnValue('blob:test-download')
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = mocks.createObjectURL
      static revokeObjectURL = mocks.revokeObjectURL
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(['JSON', 'CSV'])('should download every stored reading across pages and devices as %s', async format => {
    const user = userEvent.setup()
    const oldTime = Date.parse('2020-01-01T00:00:00Z')
    const exportEndTime = Date.parse('2026-10-18T00:00:00Z')
    mocks.query
      .mockResolvedValueOnce({ endTime: exportEndTime, deletionRevision: 7 })
      .mockResolvedValueOnce({
        page: [{ deviceSn: 'TEST-A', deviceName: 'Station A', recordedAt: oldTime, inputWatts: 0, solarInputWatts: 0, inputMeasurement: 'delta2-pd-mqtt-v1', acEnabled: false }],
        isDone: false, continueCursor: 'a-next',
      })
      .mockResolvedValueOnce({
        page: [{ deviceSn: 'TEST-A', deviceName: 'Station A', recordedAt: oldTime, inputWatts: 10, inputMeasurement: 'legacy-modules' }],
        isDone: true, continueCursor: '',
      })
      .mockResolvedValueOnce({
        page: [{ deviceSn: 'TEST-B', deviceName: 'Station B', recordedAt: oldTime + 1_000, inputWatts: 20, inputMeasurement: 'delta2-pd-v1', acEnabled: true }],
        isDone: true, continueCursor: '',
      })
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))
    await user.click(screen.getByRole('button', { name: format === 'JSON' ? 'Export All Data (JSON)' : 'Export Readings (CSV)' }))

    await waitFor(() => expect(mocks.createObjectURL).toHaveBeenCalledOnce())
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    const downloadLink = vi.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0] as HTMLAnchorElement
    expect(downloadLink.download).toMatch(new RegExp(`^ecoflow-export-\\d{4}-\\d{2}-\\d{2}\\.${format.toLowerCase()}$`))
    expect(downloadLink.href).toBe('blob:test-download')
    const blob = mocks.createObjectURL.mock.calls[0][0] as Blob
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
    expect(mocks.query.mock.calls.map(([reference]) => getFunctionName(reference))).toEqual([
      'exports:exportWindow', 'exports:readingPage', 'exports:readingPage', 'exports:readingPage',
    ])
    expect(mocks.query.mock.calls[0][1]).toEqual({})
    const endTime = exportEndTime
    expect(mocks.query.mock.calls.slice(1).map(([, args]) => args)).toEqual([
      { deviceId: 'device-a', cursor: null, endTime, deletionRevision: 7 },
      { deviceId: 'device-a', cursor: 'a-next', endTime, deletionRevision: 7 },
      { deviceId: 'device-b', cursor: null, endTime, deletionRevision: 7 },
    ])
    expect(typeof endTime).toBe('number')
    if (format === 'JSON') {
      expect(blob.type).toBe('application/json')
      const download = JSON.parse(content)
      expect(download.totalReadings).toBe(3)
      expect(download.rawPayloadsIncluded).toBe(false)
      expect(download.readingsThrough).toBe(new Date(endTime).toISOString())
      expect(download.readings).toHaveLength(3)
      expect(download.readings[0]).toMatchObject({
        recordedAt: '2020-01-01T00:00:00.000Z', inputWatts: 0, solarInputWatts: 0,
        inputMeasurement: 'delta2-pd-mqtt-v1', acEnabled: false,
      })
      expect(download.readings.map((row: { deviceSn: string }) => row.deviceSn)).toEqual(['TEST-A', 'TEST-A', 'TEST-B'])
    } else {
      expect(blob.type).toBe('text/csv')
      const [headers, ...rows] = content.split('\n').map(line => line.split(','))
      expect(rows).toHaveLength(3)
      const values = rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
      expect(values[0]).toMatchObject({
        recordedAt: '"2020-01-01T00:00:00.000Z"', inputWatts: '"0"', solarInputWatts: '"0"',
        inputMeasurement: '"delta2-pd-mqtt-v1"', acEnabled: '"false"',
      })
      expect(values.map(row => row.deviceSn)).toEqual(['"TEST-A"', '"TEST-A"', '"TEST-B"'])
    }
    expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining('3 readings'))
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:test-download')
  })

  it('should report a later page failure without downloading a partial export', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.query
      .mockResolvedValueOnce({ endTime: Date.parse('2026-10-18T00:00:00Z'), deletionRevision: 0 })
      .mockResolvedValueOnce({ page: [{ recordedAt: 0 }], isDone: false, continueCursor: 'a-next' })
      .mockRejectedValueOnce(new Error('Next page unavailable'))
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))
    await user.click(screen.getByRole('button', { name: 'Export All Data (JSON)' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Export failed: Next page unavailable'))
    expect(mocks.createObjectURL).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Export All Data (JSON)' })).toBeEnabled()
  })

  it.each(['JSON', 'CSV'])('should not download a shortened %s export when retention runs between pages', async format => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = 'Reading export stopped because retention cleanup changed the stored readings. Please export again.'
    mocks.query
      .mockResolvedValueOnce({ endTime: Date.parse('2026-10-18T00:00:00Z'), deletionRevision: 7 })
      .mockResolvedValueOnce({ page: [{ recordedAt: 0 }], isDone: false, continueCursor: 'a-next' })
      .mockRejectedValueOnce(new Error(error))
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))
    const button = screen.getByRole('button', { name: format === 'JSON' ? 'Export All Data (JSON)' : 'Export Readings (CSV)' })
    await user.click(button)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(`Export failed: ${error}`))
    expect(mocks.query.mock.calls.slice(1).map(([, args]) => args.deletionRevision)).toEqual([7, 7])
    expect(mocks.createObjectURL).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(button).toBeEnabled()
  })
})

describe('settings test email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sendTestEmail.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it('should call the email action once, prevent duplicate sends, and confirm accepted delivery', async () => {
    const user = userEvent.setup()
    let finishEmail!: (result: { success: boolean; messageId: string }) => void
    mocks.sendTestEmail.mockImplementation(() => new Promise(resolve => { finishEmail = resolve }))
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    const button = screen.getByRole('button', { name: 'Test Email' })

    await user.click(button)
    expect(mocks.sendTestEmail).toHaveBeenCalledExactlyOnceWith()
    expect(button).toBeDisabled()
    await user.click(button)
    expect(mocks.sendTestEmail).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    await act(async () => { finishEmail({ success: true, messageId: 'accepted-message' }) })
    expect(mocks.toastSuccess).toHaveBeenCalledExactlyOnceWith('Test email accepted for delivery. Check your inbox.')
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(button).toBeEnabled()
    expect(mocks.updateNotifications).not.toHaveBeenCalled()
  })

  it.each(['structured', 'thrown'])('should display a %s email error without claiming success', async failureType => {
    const user = userEvent.setup()
    const errorMessage = 'Email provider rejected the request'
    if (failureType === 'structured') {
      mocks.sendTestEmail.mockResolvedValueOnce({ success: false, error: errorMessage })
    } else {
      mocks.sendTestEmail.mockRejectedValueOnce(new Error(errorMessage))
    }
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    const button = screen.getByRole('button', { name: 'Test Email' })
    await user.click(button)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(errorMessage))
    expect(mocks.sendTestEmail).toHaveBeenCalledExactlyOnceWith()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(button).toBeEnabled()
    expect(mocks.updateNotifications).not.toHaveBeenCalled()
  })
})

describe('Google Drive backup settings', () => {
  const nonceKey = 'ecoflow.googleDrive.browserNonce'
  const state = 'a'.repeat(43)
  const nonce = 'b'.repeat(64)

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateDataRetention.mockResolvedValue(null)
    mocks.finishGoogleDriveConnection.mockReset().mockResolvedValue({ success: true })
    mocks.disconnectGoogleDrive.mockReset().mockResolvedValue({ success: true })
    mocks.startGoogleDriveConnection.mockReset()
  })

  afterEach(() => vi.restoreAllMocks())

  it('should keep existing email delivery until Drive is connected and explicitly selected', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))

    expect(screen.getByLabelText('Backup Destination')).toHaveValue('email')
    expect(screen.getByRole('option', { name: 'Google Drive + one email link' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Connect Google Drive for backups' })).toBeEnabled()
    expect(mocks.updateDataRetention).not.toHaveBeenCalled()
  })

  it('should explain missing server configuration without offering a ready Drive destination', async () => {
    mocks.googleDriveStatus!.configured = false
    const user = userEvent.setup()
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))

    expect(screen.getByText('Google Drive backups are not configured yet.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Connect Google Drive for backups' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Google Drive + one email link' })).toBeDisabled()
    expect(mocks.startGoogleDriveConnection).not.toHaveBeenCalled()
  })

  it('should save Drive delivery while preserving the selected retention, backup switch, and cadence', async () => {
    mocks.googleDriveStatus = { configured: true, connected: true, reconnectRequired: false, connectedAt: 100, folderUrl: 'https://drive.google.com/drive/folders/test-folder' }
    const user = userEvent.setup()
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))
    await user.selectOptions(screen.getByLabelText('Backup Destination'), 'googleDrive')
    await user.click(screen.getByRole('button', { name: 'Save Data Settings' }))

    expect(mocks.updateDataRetention).toHaveBeenCalledExactlyOnceWith({
      retentionPeriodDays: 90, autoCleanupEnabled: true, backupEnabled: true,
      backupIntervalHours: 168, collectionIntervalMinutes: 15, backupDestination: 'googleDrive',
    })
    expect(screen.getByText('Backups stay private in Google Drive. You receive one email with a link after each completed backup.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open backup folder' })).toHaveAttribute('href', 'https://drive.google.com/drive/folders/test-folder')
  })

  it('should keep a saved disconnected Drive destination paused and still allow disabling backups', async () => {
    mocks.dataRetention.backupDestination = 'googleDrive'
    mocks.googleDriveStatus!.reconnectRequired = true
    const user = userEvent.setup()
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))

    expect(screen.getByLabelText('Backup Destination')).toHaveValue('googleDrive')
    expect(screen.getByRole('button', { name: 'Reconnect Google Drive' })).toBeEnabled()
    expect(screen.getByText(/Automatic Drive backups are paused/)).toBeVisible()
    await user.click(screen.getByRole('switch', { name: 'Automatic Backup' }))
    await user.click(screen.getByRole('button', { name: 'Save Data Settings' }))
    expect(mocks.updateDataRetention).toHaveBeenCalledExactlyOnceWith({
      retentionPeriodDays: 90, autoCleanupEnabled: true, backupEnabled: false,
      backupIntervalHours: 168, collectionIntervalMinutes: 15,
    })
    expect(mocks.startGoogleDriveConnection).not.toHaveBeenCalled()
  })

  it('should generate a browser-bound 256-bit nonce and preserve the current origin when starting a connection', async () => {
    let rejectStart!: (error: Error) => void
    mocks.startGoogleDriveConnection.mockImplementation(() => new Promise((_resolve, reject) => { rejectStart = reject }))
    const user = userEvent.setup()
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))
    const button = screen.getByRole('button', { name: 'Connect Google Drive for backups' })
    await user.click(button)

    const storedNonce = window.sessionStorage.getItem(nonceKey)
    expect(storedNonce).toMatch(/^[a-f0-9]{64}$/)
    expect(mocks.startGoogleDriveConnection).toHaveBeenCalledExactlyOnceWith({ browserNonce: storedNonce, returnOrigin: window.location.origin })
    expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save Data Settings' })).toBeDisabled()
    await act(async () => rejectStart(new Error('Google connection unavailable')))
    expect(mocks.toastError).toHaveBeenCalledWith('Google connection unavailable')
    expect(window.sessionStorage.getItem(nonceKey)).toBeNull()
    expect(button).toBeEnabled()
    expect(mocks.updateDataRetention).not.toHaveBeenCalled()
  })

  it.each([true, false])('should finish a valid callback once in StrictMode, preserve backup enabled=%s, and clean only its state', async backupEnabled => {
    let finish!: (result: { success: true }) => void
    mocks.finishGoogleDriveConnection.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    mocks.dataRetention.backupEnabled = backupEnabled
    window.sessionStorage.setItem(nonceKey, nonce)
    window.sessionStorage.setItem('unrelated-setting', 'keep')
    window.history.replaceState({ keep: true }, '', `/settings?keep=1&drive=finish&state=${state}#backups`)
    render(<StrictMode><SettingsPage /></StrictMode>)

    expect(mocks.finishGoogleDriveConnection).toHaveBeenCalledExactlyOnceWith({ state, browserNonce: nonce })
    expect(screen.getByText('Completing your Google Drive connection…')).toBeVisible()
    await act(async () => finish({ success: true }))

    expect(mocks.toastSuccess).toHaveBeenCalledExactlyOnceWith('Google Drive connected for backups. Your saved backup schedule is unchanged.')
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/settings?keep=1#backups')
    expect(window.history.state).toEqual({ keep: true })
    expect(window.sessionStorage.getItem(nonceKey)).toBeNull()
    expect(window.sessionStorage.getItem('unrelated-setting')).toBe('keep')
    expect(screen.getByLabelText('Backup Destination')).toHaveValue('googleDrive')
    expect(screen.getByRole('switch', { name: 'Automatic Backup' })).toHaveAttribute('aria-checked', String(backupEnabled))
    if (backupEnabled) expect(screen.getByLabelText('Backup Interval')).toHaveValue('168')
    expect(mocks.updateDataRetention).not.toHaveBeenCalled()
  })

  it('should wait for authenticated status before consuming the OAuth callback', async () => {
    mocks.googleDriveStatus = null
    window.sessionStorage.setItem(nonceKey, nonce)
    window.history.replaceState({}, '', `/settings?drive=finish&state=${state}`)
    const { rerender } = render(<SettingsPage />)
    expect(mocks.finishGoogleDriveConnection).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(nonceKey)).toBe(nonce)

    mocks.googleDriveStatus = { configured: true, connected: false, reconnectRequired: false, connectedAt: null, folderUrl: null }
    rerender(<SettingsPage />)
    await waitFor(() => expect(mocks.finishGoogleDriveConnection).toHaveBeenCalledExactlyOnceWith({ state, browserNonce: nonce }))
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it.each(['missing nonce', 'invalid nonce', 'invalid state', 'missing state'])('should reject a callback with %s and require a fresh connection', async invalid => {
    window.history.replaceState({}, '', `/settings?keep=1&drive=finish${invalid === 'missing state' ? '' : `&state=${invalid === 'invalid state' ? 'short' : state}`}`)
    if (invalid !== 'missing nonce') window.sessionStorage.setItem(nonceKey, invalid === 'invalid nonce' ? 'not-a-valid-nonce' : nonce)
    render(<SettingsPage />)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith('This Google Drive connection session is missing or expired. Connect again from this browser.'))
    expect(mocks.finishGoogleDriveConnection).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?keep=1')
    expect(window.sessionStorage.getItem(nonceKey)).toBeNull()
  })

  it('should clean a rejected finish callback and show the backend error without claiming connection', async () => {
    mocks.finishGoogleDriveConnection.mockRejectedValueOnce(new Error('Google Drive authorization expired. Connect again.'))
    window.sessionStorage.setItem(nonceKey, nonce)
    window.history.replaceState({}, '', `/settings?drive=finish&state=${state}`)
    render(<SettingsPage />)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith('Google Drive authorization expired. Connect again.'))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
    expect(window.sessionStorage.getItem(nonceKey)).toBeNull()
    expect(screen.getByLabelText('Backup Destination')).toHaveValue('email')
  })

  it('should clean a provider error callback without attempting activation', async () => {
    window.sessionStorage.setItem(nonceKey, nonce)
    window.history.replaceState({}, '', `/settings?drive=error&state=${state}&keep=1`)
    render(<SettingsPage />)

    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith('Google Drive connection was not completed. Please try again.')
    expect(mocks.finishGoogleDriveConnection).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?keep=1')
    expect(window.sessionStorage.getItem(nonceKey)).toBeNull()
  })

  it('should disconnect without changing backup delivery preferences, enabled state, or cadence', async () => {
    mocks.dataRetention.backupDestination = 'googleDrive'
    mocks.googleDriveStatus = { configured: true, connected: true, reconnectRequired: false, connectedAt: 100, folderUrl: null }
    const user = userEvent.setup()
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'Data & Privacy' }))
    await user.click(screen.getByRole('button', { name: 'Disconnect Google Drive' }))

    expect(mocks.disconnectGoogleDrive).toHaveBeenCalledExactlyOnceWith()
    expect(mocks.updateDataRetention).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Google Drive disconnected. Your backup settings are unchanged.')
    expect(screen.getByLabelText('Backup Destination')).toHaveValue('googleDrive')
    expect(screen.getByRole('switch', { name: 'Automatic Backup' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Backup Interval')).toHaveValue('168')
  })
})
