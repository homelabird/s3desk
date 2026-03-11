import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { Job } from '../../../api/types'
import { ensureDomShims } from '../../../test/domShims'
import { JobsDetailsDrawer } from '../JobsDetailsDrawer'

beforeAll(() => {
	ensureDomShims()
})

const directUploadJob: Job = {
	id: 'job-direct-1',
	type: 'transfer_direct_upload',
	status: 'succeeded',
	payload: {
		bucket: 'media',
		prefix: 'uploads/2026/',
		label: 'March ingest',
		rootName: 'photos',
		rootKind: 'folder',
		totalFiles: 3,
		totalBytes: 4096,
		uploadId: 'upload-123',
	},
	progress: {
		objectsDone: 3,
		objectsTotal: 3,
		bytesDone: 4096,
		bytesTotal: 4096,
		speedBps: 2048,
		etaSeconds: 0,
	},
	error: null,
	errorCode: null,
	createdAt: '2026-03-11T09:00:00Z',
	startedAt: '2026-03-11T09:00:05Z',
	finishedAt: '2026-03-11T09:00:11Z',
}

describe('JobsDetailsDrawer', () => {
	it('renders typed operational sections before raw payload data', () => {
		render(
			<JobsDetailsDrawer
				open
				onClose={vi.fn()}
				drawerWidth={720}
				isOffline={false}
				detailsJobId={directUploadJob.id}
				job={directUploadJob}
				isFetching={false}
				isError={false}
				error={null}
				onRefresh={vi.fn()}
				onDeleteJob={vi.fn(async () => {})}
				deleteLoading={false}
				onOpenLogs={vi.fn()}
				uploadDetails={{
					bucket: 'media',
					prefix: 'uploads/2026/',
					label: 'March ingest',
					rootName: 'photos',
					rootKind: 'folder',
					totalFiles: 3,
					totalBytes: 4096,
					items: [],
				}}
				uploadRootLabel="photos/"
				uploadTablePageItems={[]}
				uploadTableDataLength={0}
				uploadTablePageSize={20}
				uploadTablePageSafe={1}
				uploadTableTotalPages={1}
				onUploadTablePrevPage={vi.fn()}
				onUploadTableNextPage={vi.fn()}
				uploadHashesLoading={false}
				uploadHashFailures={0}
				borderColor="#ddd"
				backgroundColor="#fff"
				borderRadius={12}
			/>,
		)

		expect(screen.getByText('Operational routing')).toBeInTheDocument()
		expect(screen.getByText('Behavior')).toBeInTheDocument()
		expect(screen.getByText('Timeline')).toBeInTheDocument()
		expect(screen.getByText('upload photos/ (3 files · 4.00 KB) → s3://media/uploads/2026')).toBeInTheDocument()
		expect(screen.getByText('Direct browser stream to S3')).toBeInTheDocument()
		expect(screen.getByText('s3://media/uploads/2026')).toBeInTheDocument()
		expect(screen.getByText('upload-123')).toBeInTheDocument()
		expect(screen.getByText('5s')).toBeInTheDocument()
		expect(screen.getByText('6s')).toBeInTheDocument()
	})
})
