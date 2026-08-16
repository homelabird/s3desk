import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { JobsCreateModals } from '../JobsCreateModals'

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
})
