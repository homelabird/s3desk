import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { JobsPageRouteShell } from '../JobsPageRouteShell'

const jobsPageShellMock = vi.fn()

vi.mock('../JobsPageShell', () => ({
  JobsPageShell: (props: unknown) => {
    jobsPageShellMock(props)
    return <div data-testid="jobs-page-shell" />
  },
}))

describe('JobsPageRouteShell', () => {
  it('renders the setup callout when no profile is selected', () => {
    render(
      <MemoryRouter>
        <JobsPageRouteShell
          apiToken="token"
          profileId={null}
          shell={{
            api: {} as never,
            isOffline: false,
            hasOpenOverlay: false,
            overlaysHost: {} as never,
            presentation: {} as never,
          }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('Select a profile to view jobs')).toBeInTheDocument()
    expect(jobsPageShellMock).not.toHaveBeenCalled()
  })

  it('passes shell props through when a profile is selected', () => {
    render(
      <JobsPageRouteShell
        apiToken="token"
        profileId="profile-1"
        shell={{
          api: { jobs: {} } as never,
          isOffline: true,
          hasOpenOverlay: true,
          overlaysHost: {
            createFlow: { createOpen: true },
            bucketState: { bucket: 'bucket-a' },
            detailsState: {},
            logsState: {},
            layout: {},
          } as never,
          presentation: {
            toolbar: { scopeKey: 'scope-key' },
            table: { sortedJobs: [] },
          } as never,
        }}
      />,
    )

    expect(screen.getByTestId('jobs-page-shell')).toBeInTheDocument()
    expect(jobsPageShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiToken: 'token',
        profileId: 'profile-1',
        isOffline: true,
        hasOpenOverlay: true,
        presentation: expect.objectContaining({
          toolbar: expect.objectContaining({ scopeKey: 'scope-key' }),
        }),
      }),
    )
  })
})
