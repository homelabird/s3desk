import { render, screen } from '@testing-library/react'
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
					useCompactList: false,
					policySupported: false,
					policyUnsupportedReason: 'unsupported',
					controlsSupported: false,
					controlsUnsupportedReason: 'unsupported',
					deletePending: false,
					deletingBucket: null,
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

	it('renders the list surface and forwards list props', () => {
		render(
			<BucketsPageShell
				api={createMockApiClient()}
				apiToken="token"
				profileId="profile-1"
				selectedProfile={{ name: 'Primary Profile' } as never}
				bucketCrudSupported
				bucketCrudUnsupportedReason="Bucket operations are unavailable."
				bucketsQueryError={null}
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
					useCompactList: true,
					policySupported: true,
					policyUnsupportedReason: 'unsupported',
					controlsSupported: true,
					controlsUnsupportedReason: 'unsupported',
					deletePending: true,
					deletingBucket: 'primary-bucket',
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
		expect(screen.getByTestId('buckets-dialogs')).toBeInTheDocument()
		expect(bucketsListMock).toHaveBeenCalledWith(
			expect.objectContaining({
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
