import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../../test/mockApiClient'
import { BucketsPageShell } from '../BucketsPageShell'

const bucketsListMock = vi.fn()
const bucketsDialogsPanelMock = vi.fn()

vi.mock('../BucketsList', () => ({
	BucketsList: (props: unknown) => {
		bucketsListMock(props)
		return <div data-testid="buckets-list" />
	},
}))

vi.mock('../BucketsDialogsPanel', () => ({
	BucketsDialogsPanel: (props: unknown) => {
		bucketsDialogsPanelMock(props)
		return <div data-testid="buckets-dialogs" />
	},
}))

describe('BucketsPageShell', () => {
	it.each([true, false])('shows initial bucket loading or failure (loading: %s)', (loading) => {
		render(
			<BucketsPageShell
				api={createMockApiClient()}
				apiToken="token"
				profileId="profile-1"
				selectedProfile={{ name: 'Primary Profile' } as never}
				bucketCrudSupported
				bucketCrudUnsupportedReason="Bucket operations are unavailable."
				bucketsQueryError={loading ? null : new Error('Inventory unavailable')}
				bucketsRetrying={false}
				onRetryBuckets={vi.fn()}
				bucketsLoading={loading}
				buckets={[]}
				showBucketsEmpty={false}
				openCreateModal={vi.fn()}
				createOpen={false}
				closeCreateModal={vi.fn()}
				submitCreateBucket={vi.fn()}
				createLoading={false}
				list={{
					buckets: [],
					search: '',
					onSearchChange: vi.fn(),
					useCompactList: false,
					policySupported: false,
					policyUnsupportedReason: 'unsupported',
					controlsSupported: false,
					controlsUnsupportedReason: 'unsupported',
					deletePending: false,
					deletingBucket: null,
					onOpenObjects: vi.fn(),
					onOpenControls: vi.fn(),
					onOpenPolicy: vi.fn(),
					onDelete: vi.fn(),
				}}
				dialogs={{
					policyBucket: null,
					closePolicyModal: vi.fn(),
					openControlsModal: vi.fn(),
					controlsBucket: null,
					closeControlsModal: vi.fn(),
					openPolicyModal: vi.fn(),
					bucketNotEmptyDialogBucket: null,
					closeBucketNotEmptyDialog: vi.fn(),
					openBucketNotEmptyObjects: vi.fn(),
					openBucketNotEmptyDeleteJob: vi.fn(),
				}}
			/>,
		)

		if (loading) {
			expect(screen.getByRole('status', { name: 'Loading buckets' })).toHaveTextContent('Loading buckets...')
		} else {
			expect(screen.getByText('Failed to load buckets')).toBeInTheDocument()
			expect(screen.getByRole('button', { name: 'Retry loading buckets' })).toBeEnabled()
			expect(screen.queryByRole('status', { name: 'Loading buckets' })).not.toBeInTheDocument()
		}
		expect(screen.queryByTestId('buckets-list')).not.toBeInTheDocument()
		expect(screen.queryByText('Your S3Desk workspace has no buckets yet.')).not.toBeInTheDocument()
	})

	it('shows the unsupported warning and still wires the dialogs panel', () => {
		render(
			<BucketsPageShell
				api={createMockApiClient()}
				apiToken="token"
				profileId="profile-1"
				selectedProfile={null}
				bucketCrudSupported={false}
				bucketCrudUnsupportedReason="Bucket operations are unavailable."
				bucketsQueryError={null}
				bucketsRetrying={false}
				onRetryBuckets={vi.fn()}
				bucketsLoading={false}
				buckets={[]}
				showBucketsEmpty={false}
				openCreateModal={vi.fn()}
				createOpen={false}
				closeCreateModal={vi.fn()}
				submitCreateBucket={vi.fn()}
				createLoading={false}
				list={{
					buckets: [],
					search: '',
					onSearchChange: vi.fn(),
					useCompactList: false,
					policySupported: false,
					policyUnsupportedReason: 'unsupported',
					controlsSupported: false,
					controlsUnsupportedReason: 'unsupported',
					deletePending: false,
					deletingBucket: null,
					onOpenObjects: vi.fn(),
					onOpenControls: vi.fn(),
					onOpenPolicy: vi.fn(),
					onDelete: vi.fn(),
				}}
				dialogs={{
					policyBucket: null,
					closePolicyModal: vi.fn(),
					openControlsModal: vi.fn(),
					controlsBucket: null,
					closeControlsModal: vi.fn(),
					openPolicyModal: vi.fn(),
					bucketNotEmptyDialogBucket: null,
					closeBucketNotEmptyDialog: vi.fn(),
					openBucketNotEmptyObjects: vi.fn(),
					openBucketNotEmptyDeleteJob: vi.fn(),
				}}
			/>,
		)

		expect(screen.getByText('Bucket operations unavailable')).toBeInTheDocument()
		expect(screen.queryByTestId('buckets-list')).not.toBeInTheDocument()
		expect(screen.getByTestId('buckets-dialogs')).toBeInTheDocument()
		expect(bucketsDialogsPanelMock).toHaveBeenCalledWith(
			expect.objectContaining({
				apiToken: 'token',
				profileId: 'profile-1',
				createOpen: false,
			}),
		)
	})

	it.each([
		{ state: 'loaded', error: null, retrying: false },
		{ state: 'refresh failed', error: new Error('Inventory unavailable'), retrying: false },
		{ state: 'retry pending', error: new Error('Inventory unavailable'), retrying: true },
	])('keeps the list surface and forwards list props ($state)', ({ error, retrying }) => {
		const onRetryBuckets = vi.fn()
		render(
			<BucketsPageShell
				api={createMockApiClient()}
				apiToken="token"
				profileId="profile-1"
				selectedProfile={{ name: 'Primary Profile' } as never}
				bucketCrudSupported
				bucketCrudUnsupportedReason="Bucket operations are unavailable."
				bucketsQueryError={error}
				bucketsRetrying={retrying}
				onRetryBuckets={onRetryBuckets}
				bucketsLoading={false}
				buckets={[{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }]}
				showBucketsEmpty={false}
				openCreateModal={vi.fn()}
				createOpen
				closeCreateModal={vi.fn()}
				submitCreateBucket={vi.fn()}
				createLoading
				selectedProfileProvider="s3_compatible"
				list={{
					buckets: [{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }],
					search: '',
					onSearchChange: vi.fn(),
					useCompactList: true,
					policySupported: true,
					policyUnsupportedReason: 'unsupported',
					controlsSupported: true,
					controlsUnsupportedReason: 'unsupported',
					deletePending: true,
					deletingBucket: 'primary-bucket',
					onOpenObjects: vi.fn(),
					onOpenControls: vi.fn(),
					onOpenPolicy: vi.fn(),
					onDelete: vi.fn(),
				}}
				dialogs={{
					policyBucket: 'primary-bucket',
					closePolicyModal: vi.fn(),
					openControlsModal: vi.fn(),
					controlsBucket: null,
					closeControlsModal: vi.fn(),
					openPolicyModal: vi.fn(),
					bucketNotEmptyDialogBucket: null,
					closeBucketNotEmptyDialog: vi.fn(),
					openBucketNotEmptyObjects: vi.fn(),
					openBucketNotEmptyDeleteJob: vi.fn(),
				}}
			/>,
		)

		expect(screen.getByTestId('buckets-list')).toBeInTheDocument()
		if (error) {
			expect(screen.getByText('Could not refresh buckets')).toBeInTheDocument()
			expect(screen.getByText('Showing the last loaded bucket inventory.')).toBeInTheDocument()
			const retry = screen.getByRole('button', { name: 'Retry loading buckets' })
			if (retrying) {
				expect(retry).toBeDisabled()
			} else {
				fireEvent.click(retry)
				expect(onRetryBuckets).toHaveBeenCalledOnce()
			}
		}
		expect(screen.getByTestId('buckets-dialogs')).toBeInTheDocument()
		expect(bucketsListMock).toHaveBeenCalledWith(
			expect.objectContaining({
				search: '',
				onSearchChange: expect.any(Function),
				useCompactList: true,
				deletingBucket: 'primary-bucket',
				buckets: [{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }],
			}),
		)
		expect(bucketsDialogsPanelMock).toHaveBeenCalledWith(
			expect.objectContaining({
				selectedProfileProvider: 's3_compatible',
				createOpen: true,
				createLoading: true,
				policyBucket: 'primary-bucket',
			}),
		)
	})
})
