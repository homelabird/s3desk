import { renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DownloadTask, UploadTask } from '../transferTypes'
import { useTransfersPersistence } from '../useTransfersPersistence'

const INTERRUPTED_MESSAGE = 'Transfer interrupted by refresh. Select the same file(s) and click Retry to resume.'

function buildObjectDownloadTask(id: string, status: DownloadTask['status']): DownloadTask {
	return {
		id,
		profileId: 'profile-1',
		kind: 'object',
		label: `download-${id}`,
		status,
		createdAtMs: 1,
		loadedBytes: 0,
		speedBps: 0,
		etaSeconds: 0,
		bucket: 'bucket-a',
		key: `key-${id}`,
	}
}

function buildObjectDeviceTask(id: string): DownloadTask {
	return {
		id,
		profileId: 'profile-1',
		kind: 'object_device',
		label: `download-${id}`,
		status: 'queued',
		createdAtMs: 1,
		loadedBytes: 0,
		speedBps: 0,
		etaSeconds: 0,
		bucket: 'bucket-a',
		key: `key-${id}`,
		targetDirHandle: {} as FileSystemDirectoryHandle,
		targetPath: 'downloads/key',
	}
}

function buildUploadTask(id: string, status: UploadTask['status']): UploadTask {
	return {
		id,
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'folder/',
		fileCount: 1,
		status,
		createdAtMs: 1,
		loadedBytes: 0,
		totalBytes: 100,
		speedBps: 0,
		etaSeconds: 0,
		label: `upload-${id}`,
	}
}

describe('useTransfersPersistence', () => {
	beforeEach(() => {
		window.localStorage.clear()
	})

	afterEach(() => {
		window.localStorage.clear()
	})

	it('restores persisted active tasks as canceled', async () => {
		window.localStorage.setItem(
			'transfersHistoryV1',
			JSON.stringify({
				version: 1,
				savedAtMs: 10,
				downloads: [buildObjectDownloadTask('d1', 'running')],
				uploads: [buildUploadTask('u1', 'staging')],
			}),
		)

		const { result } = renderHook(() => {
			const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([])
			const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([])
			useTransfersPersistence({ downloadTasks, uploadTasks, setDownloadTasks, setUploadTasks })
			return { downloadTasks, uploadTasks }
		})

		await waitFor(() => {
			expect(result.current.downloadTasks).toHaveLength(1)
			expect(result.current.uploadTasks).toHaveLength(1)
		})

		expect(result.current.downloadTasks[0]?.status).toBe('canceled')
		expect(result.current.downloadTasks[0]?.error).toBe(INTERRUPTED_MESSAGE)
		expect(result.current.uploadTasks[0]?.status).toBe('canceled')
		expect(result.current.uploadTasks[0]?.error).toBe(INTERRUPTED_MESSAGE)
		expect(result.current.downloadTasks[0]?.finishedAtMs).toBeTypeOf('number')
		expect(result.current.uploadTasks[0]?.finishedAtMs).toBeTypeOf('number')
	})

	it('persists only non-device downloads', async () => {
		const { result } = renderHook(() => {
			const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([
				buildObjectDownloadTask('d1', 'succeeded'),
				buildObjectDeviceTask('d2'),
			])
			const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([buildUploadTask('u1', 'queued')])
			useTransfersPersistence({ downloadTasks, uploadTasks, setDownloadTasks, setUploadTasks })
			return { downloadTasks, uploadTasks }
		})

		await waitFor(() => {
			expect(result.current.downloadTasks).toHaveLength(2)
			const raw = window.localStorage.getItem('transfersHistoryV1')
			expect(raw).not.toBeNull()
		})

		const saved = JSON.parse(window.localStorage.getItem('transfersHistoryV1') ?? '{}') as {
			downloads?: Array<{ id: string; kind: string }>
			uploads?: Array<{ id: string }>
		}
		expect(saved.downloads?.map((item) => item.id)).toEqual(['d1'])
		expect(saved.downloads?.every((item) => item.kind !== 'object_device')).toBe(true)
		expect(saved.uploads?.map((item) => item.id)).toEqual(['u1'])
	})
})
