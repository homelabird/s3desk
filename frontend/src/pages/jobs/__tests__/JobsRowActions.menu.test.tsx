import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { Job } from '../../../api/types'
import { ensureDomShims } from '../../../test/domShims'
import { JobsRowActions } from '../JobsRowActions'

beforeAll(() => {
	ensureDomShims()
})

const baseJob: Job = {
	id: 'job-1',
	type: 'transfer_sync_staging_to_s3',
	status: 'failed',
	payload: {},
	createdAt: '2026-03-09T09:40:17Z',
	error: null,
	errorCode: null,
}

function renderActions(apiToken: string, job: Job = baseJob) {
	return render(
		<JobsRowActions
			job={job}
			apiToken={apiToken}
			isOffline={false}
			isLogsLoading={false}
			activeLogJobId={null}
			cancelingJobId={null}
			retryingJobId={null}
			deletingJobId={null}
			cancelPending={false}
			retryPending={false}
			deletePending={false}
			profileId="profile-1"
			jobSummary="summary"
			onOpenDetails={vi.fn()}
			onOpenLogs={vi.fn()}
			onRequestCancelJob={vi.fn()}
			onRequestRetryJob={vi.fn()}
			onRequestDeleteJob={vi.fn(async () => {})}
			onQueueDownloadJobArtifact={vi.fn()}
		/>,
	)
}

describe('JobsRowActions menu scope', () => {
	it('hides the uncontrolled actions menu when the api token changes', () => {
		const { rerender } = renderActions('token-a')

		fireEvent.click(screen.getByRole('button', { name: 'Open actions menu' }))
		expect(screen.getByRole('menuitem', { name: /Retry/i })).toBeInTheDocument()

		rerender(
			<JobsRowActions
				job={baseJob}
				apiToken="token-b"
				isOffline={false}
				isLogsLoading={false}
				activeLogJobId={null}
				cancelingJobId={null}
				retryingJobId={null}
				deletingJobId={null}
				cancelPending={false}
				retryPending={false}
				deletePending={false}
				profileId="profile-1"
				jobSummary="summary"
				onOpenDetails={vi.fn()}
				onOpenLogs={vi.fn()}
				onRequestCancelJob={vi.fn()}
				onRequestRetryJob={vi.fn()}
				onRequestDeleteJob={vi.fn(async () => {})}
				onQueueDownloadJobArtifact={vi.fn()}
			/>,
		)

		expect(screen.queryByRole('menuitem', { name: /Retry/i })).not.toBeInTheDocument()
	})
})
