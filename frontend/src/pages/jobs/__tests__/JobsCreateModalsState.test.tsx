import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { JobsCreateModals } from '../JobsCreateModals'

vi.mock('../DeletePrefixJobModal', () => ({
	DeletePrefixJobModal: () => <div data-testid="resolved-delete-job-modal" />,
}))

describe('Jobs create modals state', () => {
	it('does not mount the delete modal until its routed flow opens', () => {
		render(
			<JobsCreateModals
				apiToken="token-a"
				profileId="profile-1"
				createDeleteOpen={false}
				onCloseDelete={vi.fn()}
				onSubmitDelete={vi.fn()}
				deleteLoading={false}
				isOffline={false}
				bucket="bucket-a"
				onBucketChange={vi.fn()}
				bucketOptions={[]}
				deleteBucket="bucket-a"
				deletePrefill={null}
			/>,
		)

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
	})

	it('lets delete modal suspension reach the parent loading fallback', async () => {
		render(
			<Suspense fallback={<div role="status" aria-label="Loading create delete job (s3)" />}>
				<JobsCreateModals
					apiToken="token-a"
					profileId="profile-1"
					createDeleteOpen
					onCloseDelete={vi.fn()}
					onSubmitDelete={vi.fn()}
					deleteLoading={false}
					isOffline={false}
					bucket="bucket-a"
					onBucketChange={vi.fn()}
					bucketOptions={[]}
					deleteBucket="bucket-a"
					deletePrefill={null}
				/>
			</Suspense>,
		)

		expect(screen.getByRole('status', { name: 'Loading create delete job (s3)' })).toBeInTheDocument()
		expect(await screen.findByTestId('resolved-delete-job-modal')).toBeInTheDocument()
	})
})
