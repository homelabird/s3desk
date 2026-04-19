import { render, screen } from '@testing-library/react'
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

vi.mock('../jobsLazy', () => ({
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

  it('passes shell props into the lazy overlays host when an overlay is open', () => {
    render(
      <JobsPageShell
        api={{ jobs: {} } as never}
        apiToken="token"
        profileId="profile-1"
        isOffline
        hasOpenOverlay
        overlaysHost={{
          createFlow: { createOpen: true } as never,
          bucketState: { bucket: 'bucket-a' } as never,
          detailsState: { detailsOpen: true } as never,
          logsState: { logRequestJobId: 'job-1' } as never,
          layout: { drawerWidth: 720 } as never,
        }}
        presentation={{
          toolbar: { scopeKey: 'scope-key' } as never,
          table: { sortedJobs: [] } as never,
        }}
      />,
    )

    expect(screen.getByTestId('jobs-overlays')).toBeInTheDocument()
    expect(overlaysMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiToken: 'token',
        profileId: 'profile-1',
        isOffline: true,
        createFlow: expect.objectContaining({ createOpen: true }),
        bucketState: expect.objectContaining({ bucket: 'bucket-a' }),
      }),
    )
  })
})
