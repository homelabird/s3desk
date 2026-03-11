import { render } from '@testing-library/react'
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

describe('JobsRowActions', () => {
	it('renders details, logs, and actions controls', () => {
		const { getByRole } = render(
			<JobsRowActions
				job={baseJob}
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

		expect(getByRole('button', { name: 'Details' })).toBeInTheDocument()
		expect(getByRole('button', { name: 'Logs' })).toBeInTheDocument()
		expect(getByRole('button', { name: 'Open actions menu' })).toBeInTheDocument()
	})
})
