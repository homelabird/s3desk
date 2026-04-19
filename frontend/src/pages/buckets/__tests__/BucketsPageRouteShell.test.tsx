import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { BucketsPageRouteShell } from '../BucketsPageRouteShell'

const bucketsPageShellMock = vi.fn()

vi.mock('../BucketsPageShell', () => ({
	BucketsPageShell: (props: unknown) => {
		bucketsPageShellMock(props)
		return <div data-testid="buckets-page-shell" />
	},
}))

describe('BucketsPageRouteShell', () => {
	it('renders the setup callout when no profile is selected', () => {
		render(
			<MemoryRouter>
				<BucketsPageRouteShell
					apiToken="token"
					profileId={null}
					shell={{
						api: {} as never,
						selectedProfile: null,
						bucketCrudSupported: true,
						bucketCrudUnsupportedReason: '',
						bucketsQueryError: null,
						bucketsLoading: false,
						buckets: [],
						showBucketsEmpty: false,
						openCreateModal: vi.fn(),
						createOpen: false,
						closeCreateModal: vi.fn(),
						submitCreateBucket: vi.fn(),
						createLoading: false,
						list: {} as never,
						dialogs: {} as never,
					}}
				/>
			</MemoryRouter>,
		)

		expect(screen.getByText('Select a profile to view buckets')).toBeInTheDocument()
		expect(bucketsPageShellMock).not.toHaveBeenCalled()
	})

	it('passes shell props through when a profile is selected', () => {
		render(
			<BucketsPageRouteShell
				apiToken="token"
				profileId="profile-1"
				shell={{
					api: { buckets: {} } as never,
					selectedProfile: { name: 'Primary Profile' } as never,
					bucketCrudSupported: true,
					bucketCrudUnsupportedReason: 'unsupported',
					bucketsQueryError: null,
					bucketsLoading: false,
					buckets: [{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }],
					showBucketsEmpty: false,
					openCreateModal: vi.fn(),
					createOpen: true,
					closeCreateModal: vi.fn(),
					submitCreateBucket: vi.fn(),
					createLoading: true,
					selectedProfileProvider: 's3_compatible',
					list: {
						buckets: [{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }],
					} as never,
					dialogs: {
						policyBucket: 'primary-bucket',
					} as never,
				}}
			/>,
		)

		expect(screen.getByTestId('buckets-page-shell')).toBeInTheDocument()
		expect(bucketsPageShellMock).toHaveBeenCalledWith(
			expect.objectContaining({
				apiToken: 'token',
				profileId: 'profile-1',
				createOpen: true,
				createLoading: true,
				selectedProfileProvider: 's3_compatible',
			}),
		)
	})
})
