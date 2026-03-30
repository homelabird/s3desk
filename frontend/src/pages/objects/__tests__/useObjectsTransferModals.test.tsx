import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TransfersContextValue } from '../../../components/Transfers'
import { useObjectsDownloadPrefix } from '../useObjectsDownloadPrefix'
import { useObjectsUploadFolder } from '../useObjectsUploadFolder'

const messageErrorMock = vi.fn()
const messageInfoMock = vi.fn()
const messageWarningMock = vi.fn()
const listAllObjectsMock = vi.fn()
const collectFilesFromDirectoryHandleMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			error: (...args: unknown[]) => messageErrorMock(...args),
			info: (...args: unknown[]) => messageInfoMock(...args),
			warning: (...args: unknown[]) => messageWarningMock(...args),
		},
	}
})

vi.mock('../../../lib/objects', () => ({
	listAllObjects: (...args: unknown[]) => listAllObjectsMock(...args),
}))

vi.mock('../../../lib/deviceFs', async () => {
	const actual = await vi.importActual<typeof import('../../../lib/deviceFs')>('../../../lib/deviceFs')
	return {
		...actual,
		collectFilesFromDirectoryHandle: (...args: unknown[]) => collectFilesFromDirectoryHandleMock(...args),
	}
})

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function createTransfersStub(): TransfersContextValue {
	return {
		activeTab: 'uploads',
		closeTransfers: vi.fn(),
		clearAllTransfers: vi.fn(),
		clearCompletedDownloads: vi.fn(),
		clearCompletedUploads: vi.fn(),
		downloadTasks: [],
		openTransfers: vi.fn(),
		queueDownloadJobArtifact: vi.fn(),
		queueDownloadObject: vi.fn(),
		queueDownloadObjectsToDevice: vi.fn(),
		queueUploadFiles: vi.fn(),
		removeDownloadTask: vi.fn(),
		removeUploadTask: vi.fn(),
		retryDownloadTask: vi.fn(),
		retryUploadTask: vi.fn(),
		cancelDownloadTask: vi.fn(),
		cancelUploadTask: vi.fn(),
		uploadTasks: [],
	} as unknown as TransfersContextValue
}

describe('objects transfer modals', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('ignores stale prefix-download responses after the modal closes', async () => {
		const listRequest = deferred<Array<{ key: string; size: number }>>()
		listAllObjectsMock.mockReturnValueOnce(listRequest.promise)
		const transfers = createTransfersStub()
		const handle = { name: 'restore-target' } as unknown as FileSystemDirectoryHandle

		const { result } = renderHook(() =>
			useObjectsDownloadPrefix({
				api: {} as never,
				apiToken: 'token-1',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'logs/',
				transfers,
			}),
		)

		act(() => {
			result.current.openDownloadPrefix('logs/')
			result.current.handleDownloadPrefixPick(handle)
			void result.current.handleDownloadPrefixSubmit({ localFolder: 'restore-target' })
		})

		act(() => {
			result.current.handleDownloadPrefixCancel()
		})

		await act(async () => {
			listRequest.resolve([{ key: 'logs/app.log', size: 128 }])
			await Promise.resolve()
		})

		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.downloadPrefixOpen).toBe(false)
		expect(result.current.downloadPrefixSubmitting).toBe(false)
	})

	it('ignores stale upload-folder responses after the modal closes', async () => {
		const collectRequest = deferred<File[]>()
		collectFilesFromDirectoryHandleMock.mockReturnValueOnce(collectRequest.promise)
		const transfers = createTransfersStub()
		const handle = { name: 'photos' } as unknown as FileSystemDirectoryHandle
		const file = new File(['photo'], 'cat.jpg', { type: 'image/jpeg' })

		const { result } = renderHook(() =>
			useObjectsUploadFolder({
				apiToken: 'token-1',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'images/',
				uploadsEnabled: true,
				uploadsDisabledReason: null,
				transfers,
			}),
		)

		act(() => {
			result.current.openUploadFolderModal()
			result.current.handleUploadFolderPick(handle)
			void result.current.handleUploadFolderSubmit()
		})

		act(() => {
			result.current.handleUploadFolderCancel()
		})

		await act(async () => {
			collectRequest.resolve([file])
			await Promise.resolve()
		})

		expect(transfers.queueUploadFiles).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.uploadFolderOpen).toBe(false)
		expect(result.current.uploadFolderSubmitting).toBe(false)
	})

	it('ignores stale prefix-download responses after the api token changes', async () => {
		const listRequest = deferred<Array<{ key: string; size: number }>>()
		listAllObjectsMock.mockReturnValueOnce(listRequest.promise)
		const transfers = createTransfersStub()
		const handle = { name: 'restore-target' } as unknown as FileSystemDirectoryHandle

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsDownloadPrefix({
					api: {} as never,
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					transfers,
				}),
			{ initialProps: { apiToken: 'token-1' } },
		)

		act(() => {
			result.current.openDownloadPrefix('logs/')
			result.current.handleDownloadPrefixPick(handle)
			void result.current.handleDownloadPrefixSubmit({ localFolder: 'restore-target' })
		})

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			listRequest.resolve([{ key: 'logs/app.log', size: 128 }])
			await Promise.resolve()
		})

		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.downloadPrefixOpen).toBe(false)
		expect(result.current.downloadPrefixSubmitting).toBe(false)
	})

	it('ignores stale upload-folder responses after the api token changes', async () => {
		const collectRequest = deferred<File[]>()
		collectFilesFromDirectoryHandleMock.mockReturnValueOnce(collectRequest.promise)
		const transfers = createTransfersStub()
		const handle = { name: 'photos' } as unknown as FileSystemDirectoryHandle
		const file = new File(['photo'], 'cat.jpg', { type: 'image/jpeg' })

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsUploadFolder({
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'images/',
					uploadsEnabled: true,
					uploadsDisabledReason: null,
					transfers,
				}),
			{ initialProps: { apiToken: 'token-1' } },
		)

		act(() => {
			result.current.openUploadFolderModal()
			result.current.handleUploadFolderPick(handle)
			void result.current.handleUploadFolderSubmit()
		})

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			collectRequest.resolve([file])
			await Promise.resolve()
		})

		expect(transfers.queueUploadFiles).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.uploadFolderOpen).toBe(false)
		expect(result.current.uploadFolderSubmitting).toBe(false)
	})
})
