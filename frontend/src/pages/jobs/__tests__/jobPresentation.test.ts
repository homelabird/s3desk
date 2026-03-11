import { describe, expect, it } from 'vitest'

import type { Job } from '../../../api/types'
import { jobMatchesSearch, jobSummary } from '../jobPresentation'

describe('jobPresentation', () => {
	it('builds a readable summary for direct uploads', () => {
		const job: Job = {
			id: 'job-direct-upload',
			type: 'transfer_direct_upload',
			status: 'succeeded',
			payload: {
				bucket: 'demo-bucket',
				prefix: 'exports/',
				rootKind: 'file',
				rootName: 'alpha.txt',
				totalFiles: 1,
				totalBytes: 110676,
				label: 'Upload: alpha.txt',
				uploadId: 'upload-1',
			},
			createdAt: '2024-01-01T00:00:00Z',
		}

		expect(jobSummary(job)).toBe('upload alpha.txt (1 file · 108.1 KB) → s3://demo-bucket/exports')
	})

	it('matches free-text search against summary and payload fields', () => {
		const job: Job = {
			id: 'job-direct-upload',
			type: 'transfer_direct_upload',
			status: 'succeeded',
			payload: {
				bucket: 'demo-bucket',
				prefix: 'exports/',
				rootKind: 'file',
				rootName: 'alpha.txt',
				totalFiles: 1,
				totalBytes: 110676,
				label: 'Upload: alpha.txt',
			},
			createdAt: '2024-01-01T00:00:00Z',
		}

		expect(jobMatchesSearch(job, 'demo-bucket')).toBe(true)
		expect(jobMatchesSearch(job, 'alpha.txt')).toBe(true)
		expect(jobMatchesSearch(job, 'direct stream')).toBe(true)
		expect(jobMatchesSearch(job, 'missing-term')).toBe(false)
	})
})
