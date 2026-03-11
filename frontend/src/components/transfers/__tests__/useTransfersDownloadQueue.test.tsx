import { act, renderHook, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import type { DownloadTask } from '../transferTypes'
import { useTransfersDownloadQueue } from '../useTransfersDownloadQueue'

const messageErrorMock = vi.fn()
const messageInfoMock = vi.fn()
const messageSuccessMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			error: (...args: unknown[]) => messageErrorMock(...args),
			info: (...args: unknown[]) => messageInfoMock(...args),
			success: (...args: unknown[]) => messageSuccessMock(...args),
		},
	}
})

vi.mock('../../../lib/deviceFs', () => ({
	getDevicePickerSupport: () => ({ ok: true }),
}))

function createApiStub(): APIClient {
	return {
		getJob: vi.fn(),
		getObjectDownloadURL: vi.fn(),
		downloadJobArtifact: vi.fn(),
	} as unknown as APIClient
}

function createDirectoryHandle(name: string): FileSystemDirectoryHandle {
	return { name } as FileSystemDirectoryHandle
}

describe('useTransfersDownloadQueue', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		messageErrorMock.mockClear()
		messageInfoMock.mockClear()
		messageSuccessMock.mockClear()
	})

	it('does not queue the same device download twice for the same target', async () => {
		const openTransfers = vi.fn()
		const targetDirHandle = createDirectoryHandle('downloads')
		const args = {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			items: [{ key: 'folder/alpha.txt', size: 10 }],
			targetDirHandle,
			prefix: 'folder/',
		}

		const { result } = renderHook(() => {
			const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([])
			const downloadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
			const downloadEstimatorByTaskIdRef = useRef({})
			const updateDownloadTask = (taskId: string, updater: (task: DownloadTask) => DownloadTask) => {
				setDownloadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
			}

			return {
				downloadTasks,
				...useTransfersDownloadQueue({
					api: createApiStub(),
					downloadLinkProxyEnabled: false,
					downloadConcurrency: 0,
					downloadTasks,
					setDownloadTasks,
					downloadAbortByTaskIdRef,
					downloadEstimatorByTaskIdRef,
					updateDownloadTask,
					openTransfers,
				}),
			}
		})

		act(() => {
			result.current.queueDownloadObjectsToDevice(args)
		})

		await waitFor(() => {
			expect(result.current.downloadTasks).toHaveLength(1)
		})

		act(() => {
			result.current.queueDownloadObjectsToDevice(args)
		})

		await waitFor(() => {
			expect(result.current.downloadTasks).toHaveLength(1)
		})

		expect(result.current.downloadTasks[0]).toMatchObject({
			kind: 'object_device',
			key: 'folder/alpha.txt',
			targetPath: 'alpha.txt',
		})
		expect(messageInfoMock).toHaveBeenCalledWith('Download already queued')
		expect(openTransfers).toHaveBeenCalledTimes(2)
	})

	it('deduplicates duplicate device items within the same batch', async () => {
		const openTransfers = vi.fn()

		const { result } = renderHook(() => {
			const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([])
			const downloadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
			const downloadEstimatorByTaskIdRef = useRef({})
			const updateDownloadTask = (taskId: string, updater: (task: DownloadTask) => DownloadTask) => {
				setDownloadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
			}

			return {
				downloadTasks,
				...useTransfersDownloadQueue({
					api: createApiStub(),
					downloadLinkProxyEnabled: false,
					downloadConcurrency: 0,
					downloadTasks,
					setDownloadTasks,
					downloadAbortByTaskIdRef,
					downloadEstimatorByTaskIdRef,
					updateDownloadTask,
					openTransfers,
				}),
			}
		})

		act(() => {
			result.current.queueDownloadObjectsToDevice({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				items: [
					{ key: 'folder/alpha.txt', size: 10 },
					{ key: 'folder/alpha.txt', size: 10 },
				],
				targetDirHandle: createDirectoryHandle('downloads'),
				prefix: 'folder/',
			})
		})

		await waitFor(() => {
			expect(result.current.downloadTasks).toHaveLength(1)
		})

		expect(messageInfoMock).toHaveBeenCalledWith('Skipped 1 already queued download(s)')
		expect(openTransfers).toHaveBeenCalledWith('downloads')
	})
})
