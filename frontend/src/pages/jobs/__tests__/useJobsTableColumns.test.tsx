import { render, renderHook } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { Job } from '../../../api/types'
import { ensureDomShims } from '../../../test/domShims'
import cellStyles from '../JobsCellText.module.css'
import { useJobsTableColumns } from '../useJobsTableColumns'

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

function buildArgs() {
	return {
		mergedColumnVisibility: {
			id: true,
			type: true,
			summary: true,
			status: true,
			progress: true,
			errorCode: true,
			error: true,
			createdAt: true,
			actions: true,
		},
		isOffline: false,
		isLogsLoading: false,
		activeLogJobId: null,
		cancelingJobId: null,
		retryingJobId: null,
		deletingJobId: null,
		cancelPending: false,
		retryPending: false,
		deletePending: false,
		profileId: 'profile-1',
		getJobSummary: vi.fn(() => 'summary'),
		openDetailsForJob: vi.fn(),
		openLogsForJob: vi.fn(),
		requestCancelJob: vi.fn(),
		requestRetryJob: vi.fn(),
		requestDeleteJob: vi.fn(),
		queueDownloadJobArtifact: vi.fn(),
	} as const
}

describe('useJobsTableColumns', () => {
	it('renders long error values as a single-line preview', () => {
		const { result } = renderHook(() => useJobsTableColumns(buildArgs()))
		const errorColumn = result.current.find((column) => column.key === 'error')
		expect(errorColumn?.render).toBeTypeOf('function')

		const longError = 'Error returned by ObjectStorage Service.\nHttp Status Code: 401.\nError Code: NotAuthenticated.'
		const { container } = render(
			<table><tbody><tr><td>{errorColumn!.render!(longError, { ...baseJob, error: longError })}</td></tr></tbody></table>,
		)

		const text = container.querySelector(`.${cellStyles.singleLine}`)
		expect(text).not.toBeNull()
		expect(text).toHaveTextContent(/Error returned by ObjectStorage Service\.\s+Http Status Code: 401\.\s+Error Code: NotAuthenticated\./)
		expect(text).toHaveClass(cellStyles.cellText)
		expect(text).toHaveClass(cellStyles.singleLine)
		expect(text).not.toHaveClass(cellStyles.multiLine)
	})
})
