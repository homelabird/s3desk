import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { JobsPageShell } from '../JobsPageShell'

const toolbarMock = vi.fn()
const tableMock = vi.fn()
const overlaysMock = vi.fn()

vi.mock('../JobsToolbar', () => ({
  JobsToolbar: (props: unknown) => {
    toolbarMock(props)
    return <div data-testid="jobs-toolbar" />
  },
}))

vi.mock('../JobsTableSection', () => ({
  JobsTableSection: (props: unknown) => {
    tableMock(props)
    return <div data-testid="jobs-table" />
  },
}))

vi.mock('../JobsOverlaysHost', () => ({
  JobsOverlaysHost: (props: unknown) => {
    overlaysMock(props)
    return <div data-testid="jobs-overlays" />
  },
}))

describe('JobsPageShell', () => {
  it('renders toolbar and table and skips overlays when no overlay is open', () => {
    render(
      <JobsPageShell
        api={{} as never}
        apiToken="token"
        profileId="profile-1"
        isOffline={false}
        hasOpenOverlay={false}
        overlaysHost={{
          createFlow: {} as never,
          bucketState: {} as never,
          detailsState: {} as never,
          logsState: {} as never,
          layout: {} as never,
        }}
        presentation={{
          toolbar: { scopeKey: 'scope-key' } as never,
          table: { sortedJobs: [] } as never,
        }}
      />,
    )

    expect(screen.getByTestId('jobs-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('jobs-table')).toBeInTheDocument()
    expect(screen.queryByTestId('jobs-overlays')).not.toBeInTheDocument()
    expect(toolbarMock).toHaveBeenCalledWith(expect.objectContaining({ scopeKey: 'scope-key' }))
    expect(tableMock).toHaveBeenCalledWith(expect.objectContaining({ sortedJobs: [] }))
    expect(overlaysMock).not.toHaveBeenCalled()
  })

  it('renders the highest-priority accessible fallback before the lazy overlays host resolves', async () => {
    const onCloseLogs = vi.fn()

    render(
      <JobsPageShell
        api={{ jobs: {} } as never}
        apiToken="token"
        profileId="profile-1"
        isOffline
        hasOpenOverlay
        overlaysHost={{
          createFlow: { createDeleteOpen: true } as never,
          bucketState: { bucket: 'bucket-a' } as never,
          detailsState: { detailsOpen: true } as never,
          logsState: { logRequestJobId: 'job-1', onCloseLogs } as never,
          layout: { drawerWidth: 720 } as never,
        }}
        presentation={{
          toolbar: { scopeKey: 'scope-key' } as never,
          table: { sortedJobs: [] } as never,
        }}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Job Logs' })).toHaveStyle({ width: '720px' })
    expect(screen.getByRole('status', { name: 'Loading job logs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCloseLogs).toHaveBeenCalledTimes(1)

    expect(await screen.findByTestId('jobs-overlays')).toBeInTheDocument()
    expect(overlaysMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiToken: 'token',
        profileId: 'profile-1',
        isOffline: true,
        createFlow: expect.objectContaining({ createDeleteOpen: true }),
        bucketState: expect.objectContaining({ bucket: 'bucket-a' }),
      }),
    )
  })
})
