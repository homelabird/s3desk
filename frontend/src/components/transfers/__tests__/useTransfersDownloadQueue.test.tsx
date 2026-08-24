import { act, renderHook, waitFor } from '@testing-library/react'
import { useCallback, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { APIClientShape } from '../../../api/client'
import { directoryPickerUnavailableHint } from '../../../lib/secureContext'
import type { DownloadTask, JobArtifactDownloadTask } from '../transferTypes'
import { useTransfersDownloadQueue } from '../useTransfersDownloadQueue'

const { devicePickerSupportRef, downloadURLWithProgressMock, saveBlobMock } = vi.hoisted(() => ({
	devicePickerSupportRef: { current: { ok: true } as { ok: boolean; reason?: string } },
	downloadURLWithProgressMock: vi.fn(),
	saveBlobMock: vi.fn(),
}))

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
	getDevicePickerSupport: () => devicePickerSupportRef.current,
}))

vi.mock('../transferDownloadUtils', async () => {
	const actual = await vi.importActual<typeof import('../transferDownloadUtils')>('../transferDownloadUtils')
	return {
		...actual,
		downloadURLWithProgress: downloadURLWithProgressMock,
		saveBlob: saveBlobMock,
	}
})

function createApiStub(): APIClientShape {
	return {
		getJob: vi.fn(),
		getObjectDownloadURL: vi.fn(),
		downloadJobArtifact: vi.fn(),
	} as unknown as APIClientShape
}

function createDirectoryHandle(name: string): FileSystemDirectoryHandle {
	return { name } as FileSystemDirectoryHandle
}

describe('useTransfersDownloadQueue', () => {
	afterEach(() => {
		devicePickerSupportRef.current = { ok: true }
		try {
			vi.runOnlyPendingTimers()
		} catch {
			// ignore when fake timers are not active
		}
		vi.useRealTimers()
		vi.restoreAllMocks()
		messageErrorMock.mockClear()
		messageInfoMock.mockClear()
		messageSuccessMock.mockClear()
		downloadURLWithProgressMock.mockReset()
		saveBlobMock.mockReset()
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
			const updateDownloadTask = useCallback((taskId: string, updater: (task: DownloadTask) => DownloadTask) => {
				setDownloadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
			}, [])

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

	it('keeps the same object key independent across target directories', async () => {
		const openTransfers = vi.fn()
		const firstTarget = createDirectoryHandle('first')
		const secondTarget = createDirectoryHandle('second')

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

		const baseArgs = {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			items: [{ key: 'folder/alpha.txt', size: 10 }],
			prefix: 'folder/',
		}
		act(() => {
			result.current.queueDownloadObjectsToDevice({ ...baseArgs, targetDirHandle: firstTarget })
		})
		await waitFor(() => expect(result.current.downloadTasks).toHaveLength(1))

		act(() => {
			result.current.queueDownloadObjectsToDevice({ ...baseArgs, targetDirHandle: secondTarget })
		})
		await waitFor(() => expect(result.current.downloadTasks).toHaveLength(2))
		expect(result.current.downloadTasks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ targetDirHandle: firstTarget }),
				expect.objectContaining({ targetDirHandle: secondTarget }),
			]),
		)
	})

	it('uses the shared directory-picker fallback when device downloads are unavailable', async () => {
		devicePickerSupportRef.current = { ok: false }
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
				items: [{ key: 'folder/alpha.txt', size: 10 }],
				targetDirHandle: createDirectoryHandle('downloads'),
				prefix: 'folder/',
			})
		})

		expect(result.current.downloadTasks).toHaveLength(0)
		expect(openTransfers).not.toHaveBeenCalled()
		expect(messageErrorMock).toHaveBeenCalledWith(directoryPickerUnavailableHint())
	})

	it('aborts a pending object presign before raw download or save starts', async () => {
		let resolvePresign!: (value: { url: string }) => void
		const presignRequest = new Promise<{ url: string }>((resolve) => {
			resolvePresign = resolve
		})
		let presignSignal: AbortSignal | undefined
		const getObjectDownloadURL = vi.fn((args: { signal?: AbortSignal }) => {
			presignSignal = args.signal
			return presignRequest
		})
		downloadURLWithProgressMock.mockReturnValue({
			promise: Promise.resolve({ blob: new Blob(['download']), contentDisposition: null, contentType: null }),
			abort: vi.fn(),
		})

		const { result } = renderHook(() => {
			const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([])
			const downloadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
			const downloadEstimatorByTaskIdRef = useRef({})
			const updateDownloadTask = (taskId: string, updater: (task: DownloadTask) => DownloadTask) => {
				setDownloadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
			}

			return {
				downloadTasks,
				downloadAbortByTaskIdRef,
				...useTransfersDownloadQueue({
					api: {
						objects: { getObjectDownloadURL },
						jobs: { getJob: vi.fn(), downloadJobArtifact: vi.fn() },
					} as unknown as APIClientShape,
					downloadLinkProxyEnabled: false,
					downloadConcurrency: 1,
					downloadTasks,
					setDownloadTasks,
					downloadAbortByTaskIdRef,
					downloadEstimatorByTaskIdRef,
					updateDownloadTask,
					openTransfers: vi.fn(),
				}),
			}
		})

		act(() => {
			result.current.queueDownloadObject({ profileId: 'profile-1', bucket: 'bucket-a', key: 'report.pdf' })
		})
		await waitFor(() => expect(getObjectDownloadURL).toHaveBeenCalledTimes(1))
		const taskId = result.current.downloadTasks[0]!.id

		act(() => {
			result.current.downloadAbortByTaskIdRef.current[taskId]?.()
		})
		await act(async () => {
			resolvePresign({ url: 'https://storage.local/report.pdf' })
			await Promise.resolve()
		})

		expect(presignSignal).toBeInstanceOf(AbortSignal)
		expect(presignSignal?.aborted).toBe(true)
		expect(downloadURLWithProgressMock).not.toHaveBeenCalled()
		expect(saveBlobMock).not.toHaveBeenCalled()
	})

	it('batches waiting jobs, preserves canceled tasks, and aborts polling on unmount', async () => {
		vi.useFakeTimers()
		let resolveFirstBatch: ((value: { items: Array<{ id: string; status: string }> }) => void) | undefined
		const listJobs = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirstBatch = resolve
					}),
			)
			.mockImplementationOnce(() => new Promise(() => {}))
		const api = {
			jobs: { listJobs, downloadJobArtifact: vi.fn() },
			objects: { getObjectDownloadURL: vi.fn() },
		} as unknown as APIClientShape
		const waitingTasks: JobArtifactDownloadTask[] = Array.from({ length: 201 }, (_, index) => ({
			id: `job-artifact-${index + 1}`,
			kind: 'job_artifact',
			profileId: 'profile-1',
			jobId: `job-${index + 1}`,
			label: `Job artifact ${index + 1}`,
			status: 'waiting',
			createdAtMs: index + 1,
			loadedBytes: 0,
			totalBytes: 10,
			speedBps: 0,
			etaSeconds: 0,
		}))

		const { result, unmount } = renderHook(() => {
			const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>(waitingTasks)
			const downloadAbortByTaskIdRef = useRef<Record<string, () => void>>({})
			const downloadEstimatorByTaskIdRef = useRef({})
			const updateDownloadTask = useCallback((taskId: string, updater: (task: DownloadTask) => DownloadTask) => {
				setDownloadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)))
			}, [])

			return {
				downloadTasks,
				setDownloadTasks,
				...useTransfersDownloadQueue({
					api,
					downloadLinkProxyEnabled: false,
					downloadConcurrency: 0,
					downloadTasks,
					setDownloadTasks,
					downloadAbortByTaskIdRef,
					downloadEstimatorByTaskIdRef,
					updateDownloadTask,
					openTransfers: vi.fn(),
				}),
			}
		})

		await act(async () => {
			await Promise.resolve()
		})
		expect(listJobs).toHaveBeenCalledTimes(1)
		expect(listJobs.mock.calls[0]?.[0]).toBe('profile-1')
		expect(listJobs.mock.calls[0]?.[1]).toMatchObject({
			ids: waitingTasks.slice(0, 200).map((task) => task.jobId),
			limit: 200,
			signal: expect.any(AbortSignal),
		})

		act(() => {
			result.current.setDownloadTasks((prev) =>
				prev.map((task) => (task.id === waitingTasks[0]?.id ? { ...task, status: 'canceled' } : task)),
			)
		})

		await act(async () => {
			resolveFirstBatch?.({
				items: waitingTasks.slice(0, 200).map((task) => ({ id: task.jobId, status: 'succeeded' })),
			})
			await Promise.resolve()
			await Promise.resolve()
		})
		expect(result.current.downloadTasks[0]?.status).toBe('canceled')
		expect(result.current.downloadTasks[1]?.status).toBe('queued')
		expect(listJobs).toHaveBeenCalledTimes(2)
		expect(listJobs.mock.calls[1]?.[1]).toMatchObject({
			ids: [waitingTasks[200]?.jobId],
			limit: 1,
			signal: expect.any(AbortSignal),
		})

		const signal = listJobs.mock.calls[1]?.[1]?.signal
		unmount()
		expect(signal?.aborted).toBe(true)
	})
})
