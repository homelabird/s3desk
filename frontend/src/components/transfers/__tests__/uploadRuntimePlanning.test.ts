import { describe, expect, it } from 'vitest'

import type { UploadTask } from '../transferTypes'
import {
	buildResumeFilesByPath,
	buildResumeTrackingPlan,
	planResumeChunkSettings,
	planUploadMode,
} from '../uploadRuntimePlanning'

function fileItem(name: string, size: number) {
	return {
		file: new File(['x'.repeat(size)], name),
		relPath: name,
	}
}

function uploadTask(overrides: Partial<UploadTask> = {}): UploadTask {
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: '',
		fileCount: 1,
		status: 'queued',
		createdAtMs: 1,
		loadedBytes: 0,
		totalBytes: 128,
		speedBps: 0,
		etaSeconds: 0,
		label: 'Upload',
		...overrides,
	}
}

describe('uploadRuntimePlanning', () => {
	it('prefers presigned uploads when capabilities allow them', () => {
		expect(
			planUploadMode({
				uploadCapability: { presignedUpload: true, directUpload: true },
				uploadDirectStream: true,
			}),
		).toMatchObject({
			canUsePresigned: true,
			canUseDirect: true,
			directModePreferred: true,
			fallbackMode: 'direct',
			preferredMode: 'presigned',
		})
	})

	it('falls back to direct only when direct streaming is enabled and supported', () => {
		expect(
			planUploadMode({
				uploadCapability: { presignedUpload: false, directUpload: true },
				uploadDirectStream: true,
			}).preferredMode,
		).toBe('direct')

		expect(
			planUploadMode({
				uploadCapability: { presignedUpload: false, directUpload: true },
				uploadDirectStream: false,
			}).preferredMode,
		).toBe('staging')
	})

	it('builds resume files from persisted multi-file state before legacy single-file fields', () => {
		const item = fileItem('ignored.bin', 10)
		const resumeFiles = buildResumeFilesByPath({
			task: uploadTask({
				resumeChunkSizeBytes: 16,
				resumeFileSize: 10,
				resumeFiles: [
					{ path: 'docs/a.bin', size: 32, chunkSizeBytes: 8 },
					{ path: ' ', size: 64, chunkSizeBytes: 8 },
				],
			}),
			items: [item],
			allowResume: true,
		})

		expect(resumeFiles.size).toBe(1)
		expect(resumeFiles.get('docs/a.bin')).toEqual({ size: 32, chunkSizeBytes: 8 })
	})

	it('rejects mixed resume chunk sizes unless conversion is enabled', () => {
		const resumeFilesByPath = new Map([
			['a.bin', { size: 32, chunkSizeBytes: 8 }],
			['b.bin', { size: 64, chunkSizeBytes: 16 }],
		])

		expect(
			planResumeChunkSettings({
				resumeFilesByPath,
				uploadResumeConversionEnabled: false,
			}),
		).toMatchObject({ ok: false })
		expect(
			planResumeChunkSettings({
				resumeFilesByPath,
				uploadResumeConversionEnabled: true,
			}),
		).toEqual({ ok: true, resumeChunkSizeBytes: 8, allowPerFileChunkSize: true })
	})

	it('tracks resume metadata for non-presigned large files and resumed files', () => {
		const small = fileItem('small.bin', 5)
		const resumed = fileItem('resumed.bin', 7)
		const large = fileItem('large.bin', 20)
		const resumeFilesByPath = new Map([['resumed.bin', { size: 7, chunkSizeBytes: 4 }]])

		const plan = buildResumeTrackingPlan({
			items: [small, resumed, large],
			attemptMode: 'staging',
			resumeFilesByPath,
			chunkThresholdBytes: 10,
			chunkSizeBytes: 12,
		})

		expect(plan.shouldTrackResume).toBe(true)
		expect(plan.resumeFilesNext).toEqual([
			{ path: 'resumed.bin', size: 7, chunkSizeBytes: 4 },
			{ path: 'large.bin', size: 20, chunkSizeBytes: 12 },
		])
		expect(plan.chunkSizeByPath).toEqual({
			'resumed.bin': 4,
			'large.bin': 12,
		})
	})

	it('does not track resume metadata for presigned uploads', () => {
		const plan = buildResumeTrackingPlan({
			items: [fileItem('large.bin', 20)],
			attemptMode: 'presigned',
			resumeFilesByPath: new Map(),
			chunkThresholdBytes: 10,
			chunkSizeBytes: 12,
		})

		expect(plan).toEqual({
			shouldTrackResume: false,
			resumeFilesNext: undefined,
			chunkSizeByPath: {},
		})
	})
})
