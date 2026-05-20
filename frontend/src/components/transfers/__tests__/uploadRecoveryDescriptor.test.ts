import { describe, expect, it } from 'vitest'

import type { UploadTask } from '../transferTypes'
import { buildUploadRecoveryDescriptor, getUploadFallbackLine, getUploadRetryFileHandleState } from '../uploadRecoveryDescriptor'

function uploadTask(overrides: Partial<UploadTask> = {}): UploadTask {
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'docs/',
		fileCount: 1,
		status: 'failed',
		createdAtMs: 1,
		loadedBytes: 0,
		totalBytes: 128,
		speedBps: 0,
		etaSeconds: 0,
		label: 'Upload: report.bin',
		filePaths: ['report.bin'],
		...overrides,
	}
}

describe('uploadRecoveryDescriptor', () => {
	it('describes provider unsupported fallback without implementation jargon', () => {
		const task = uploadTask({
			uploadMode: 'direct',
			uploadFallbackFrom: 'presigned',
			uploadFallbackReason: 'provider_unsupported',
		})

		expect(getUploadFallbackLine(task)).toBe('Fallback: Presigned upload is unavailable here. Continuing with Direct upload.')
		expect(buildUploadRecoveryDescriptor(task)).toMatchObject({
			modeTagLabel: 'Direct',
			showFallbackTag: true,
		})
	})

	it('describes network fallback and retry handle state', () => {
		const task = uploadTask({
			uploadMode: 'staging',
			uploadFallbackFrom: 'presigned',
			uploadFallbackReason: 'network_path_failed',
			retryFileHandleState: 'remembered',
		})
		const descriptor = buildUploadRecoveryDescriptor(task)

		expect(getUploadFallbackLine(task)).toBe('Fallback: Presigned browser upload failed on the network. Continuing with Staging upload.')
		expect(descriptor.canRetryWithRememberedFiles).toBe(true)
		expect(descriptor.retryRequiresFileSelection).toBe(false)
		expect(descriptor.lines.map((line) => line.text)).toContain('Recovery: Retry will reuse remembered local files.')
	})

	it('requires file re-selection for persisted or missing local file failures', () => {
		const task = uploadTask({
			error: 'Transfer interrupted by refresh. Select the same file(s) and click Retry to resume.',
		})
		const descriptor = buildUploadRecoveryDescriptor(task)

		expect(getUploadRetryFileHandleState(task)).toBe('selection_required')
		expect(descriptor.retryRequiresFileSelection).toBe(true)
		expect(descriptor.lines.map((line) => line.text)).toContain(
			'Recovery: Retry opens the file picker. Select the same files or folder to resume.',
		)
	})

	it('surfaces server-side finalization state for committed uploads', () => {
		const descriptor = buildUploadRecoveryDescriptor(uploadTask({ status: 'waiting_job', jobId: 'job-1' }))

		expect(descriptor.lines.map((line) => line.text)).toContain(
			'Finalization: server job is applying uploaded files. Open Jobs for details.',
		)
	})
})
