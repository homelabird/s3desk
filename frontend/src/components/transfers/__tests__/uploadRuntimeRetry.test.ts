// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UploadTask } from '../transferTypes'
import { resolveRetryUploadItems } from '../uploadRuntimeRetry'

const promptForFilesMock = vi.hoisted(() => vi.fn())

vi.mock('../transfersUploadUtils', async () => {
	const actual = await vi.importActual<typeof import('../transfersUploadUtils')>('../transfersUploadUtils')
	return {
		...actual,
		promptForFiles: (...args: unknown[]) => promptForFilesMock(...args),
	}
})

function createUploadTask(overrides: Partial<UploadTask> = {}): UploadTask {
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
		resumeFileSize: 128,
		...overrides,
	}
}

function createFile(name: string, size: number, path = name) {
	const file = new File(['x'.repeat(size)], name)
	Object.defineProperty(file, 'webkitRelativePath', {
		value: path,
		configurable: true,
	})
	return file
}

describe('resolveRetryUploadItems', () => {
	beforeEach(() => {
		promptForFilesMock.mockReset()
	})

	it('matches selected files against the previous relative paths', async () => {
		const file = createFile('report.bin', 128, 'selected-root/folder/report.bin')
		promptForFilesMock.mockResolvedValue([file])

		const result = await resolveRetryUploadItems({
			task: createUploadTask({
				fileCount: 1,
				filePaths: ['folder/report.bin'],
				resumeFileSize: 128,
			}),
		})

		expect(promptForFilesMock).toHaveBeenCalledWith({ multiple: true, directory: true })
		expect(result).toMatchObject({
			ok: true,
			selection: {
				totalBytes: 128,
				filePaths: ['folder/report.bin'],
				resumeFileSize: 128,
			},
		})
		if (result.ok) expect(result.selection.items[0].file).toBe(file)
	})

	it('rejects a resume selection when the file path is missing', async () => {
		promptForFilesMock.mockResolvedValue([createFile('other.bin', 128, 'folder/other.bin')])

		const result = await resolveRetryUploadItems({
			task: createUploadTask({
				filePaths: ['folder/report.bin'],
				resumeFileSize: 128,
			}),
		})

		expect(result).toEqual({
			ok: false,
			error: 'Missing 1 file(s). Select the same files or folder to resume.',
		})
	})

	it('rejects a resume selection when the file size changed', async () => {
		promptForFilesMock.mockResolvedValue([createFile('report.bin', 64, 'selected-root/folder/report.bin')])

		const result = await resolveRetryUploadItems({
			task: createUploadTask({
				filePaths: ['folder/report.bin'],
				resumeFileSize: 128,
				resumeFiles: [{ path: 'folder/report.bin', size: 128, chunkSizeBytes: 32 }],
			}),
		})

		expect(result).toEqual({
			ok: false,
			error: 'Missing 1 file(s). Select the same files or folder to resume.',
		})
	})

	it('returns canceled when the picker is dismissed', async () => {
		promptForFilesMock.mockResolvedValue(null)

		const result = await resolveRetryUploadItems({
			task: createUploadTask(),
		})

		expect(result).toEqual({ ok: false, canceled: true })
	})

	it.each([true, false])('requires the whole mixed-size selection when small file is present: %s', async (includeSmall) => {
		const large = createFile('large.bin', 128, 'selected-root/folder/large.bin')
		const small = createFile('small.txt', 4, 'selected-root/folder/small.txt')
		promptForFilesMock.mockResolvedValue(includeSmall ? [large, small] : [large])
		const result = await resolveRetryUploadItems({ task: createUploadTask({
			fileCount: 2,
			filePaths: ['folder/large.bin', 'folder/small.txt'],
			resumeFileSize: undefined,
			resumeFiles: [{ path: 'folder/large.bin', size: 128, chunkSizeBytes: 32 }],
		}) })
		if (includeSmall) {
			expect(result).toMatchObject({ ok: true, selection: { filePaths: ['folder/large.bin', 'folder/small.txt'], totalBytes: 132 } })
		} else {
			expect(result).toEqual({ ok: false, error: 'Missing 1 file(s). Select the same files or folder to resume.' })
		}
	})
})
