import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { APIClientShape } from '../../../api/client'
import type { TransfersContextValue } from '../../../components/transfersTypes'
import {
	noFilesFoundInSelectedFolderHint,
	noObjectsFoundUnderPrefixHint,
	selectLocalFolderFirstHint,
} from '../../../lib/secureContext'
import { useObjectsDownloadPrefix } from '../useObjectsDownloadPrefix'
import { useObjectsUploadFolder } from '../useObjectsUploadFolder'

const messageErrorMock = vi.fn()
const messageInfoMock = vi.fn()
const messageWarningMock = vi.fn()

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

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

type ListObjectsResponse = {
	items: Array<{ key: string; size: number }>
	commonPrefixes: string[]
	isTruncated: boolean
	nextContinuationToken?: string | null
}

function createApiStub(listObjects: () => Promise<ListObjectsResponse>): APIClientShape {
	return {
		objects: {
			listObjects: vi.fn(listObjects),
		},
	} as unknown as APIClientShape
}

function createFileHandle(file: Promise<File> | File): FileSystemFileHandle {
	return {
		kind: 'file',
		getFile: async () => await file,
	} as unknown as FileSystemFileHandle
}

function createDirectoryHandle(
	name: string,
	entries: Array<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> = [],
): FileSystemDirectoryHandle {
	return {
		kind: 'directory',
		name,
		async *entries() {
			for (const entry of entries) {
				yield entry
			}
		},
	} as unknown as FileSystemDirectoryHandle
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
		const listRequest = deferred<ListObjectsResponse>()
		const transfers = createTransfersStub()
		const handle = { name: 'restore-target' } as unknown as FileSystemDirectoryHandle
		const api = createApiStub(() => listRequest.promise)

		const { result } = renderHook(() =>
			useObjectsDownloadPrefix({
				api,
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
		})

		await waitFor(() => expect(result.current.downloadPrefixCanSubmit).toBe(true))

		act(() => {
			void result.current.handleDownloadPrefixSubmit({ localFolder: 'restore-target' })
		})

		act(() => {
			result.current.handleDownloadPrefixCancel()
		})

		await act(async () => {
			listRequest.resolve({
				items: [{ key: 'logs/app.log', size: 128 }],
				commonPrefixes: [],
				isTruncated: false,
				nextContinuationToken: undefined,
			})
			await Promise.resolve()
		})

		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.downloadPrefixOpen).toBe(false)
		expect(result.current.downloadPrefixSubmitting).toBe(false)
	})

	it('ignores stale upload-folder responses after the modal closes', async () => {
		const fileRequest = deferred<File>()
		const transfers = createTransfersStub()
		const file = new File(['photo'], 'cat.jpg', { type: 'image/jpeg' })
		const handle = createDirectoryHandle('photos', [['cat.jpg', createFileHandle(fileRequest.promise)]])

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
		})

		await waitFor(() => expect(result.current.uploadFolderCanSubmit).toBe(true))

		act(() => {
			void result.current.handleUploadFolderSubmit()
		})

		act(() => {
			result.current.handleUploadFolderCancel()
		})

		await act(async () => {
			fileRequest.resolve(file)
			await Promise.resolve()
		})

		expect(transfers.queueUploadFiles).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.uploadFolderOpen).toBe(false)
		expect(result.current.uploadFolderSubmitting).toBe(false)
	})

	it('ignores stale prefix-download responses after the api token changes', async () => {
		const listRequest = deferred<ListObjectsResponse>()
		const transfers = createTransfersStub()
		const handle = { name: 'restore-target' } as unknown as FileSystemDirectoryHandle
		const api = createApiStub(() => listRequest.promise)

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsDownloadPrefix({
					api,
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
		})

		await waitFor(() => expect(result.current.downloadPrefixCanSubmit).toBe(true))

		act(() => {
			void result.current.handleDownloadPrefixSubmit({ localFolder: 'restore-target' })
		})

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			listRequest.resolve({
				items: [{ key: 'logs/app.log', size: 128 }],
				commonPrefixes: [],
				isTruncated: false,
				nextContinuationToken: undefined,
			})
			await Promise.resolve()
		})

		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.downloadPrefixOpen).toBe(false)
		expect(result.current.downloadPrefixSubmitting).toBe(false)
	})

	it('ignores stale upload-folder responses after the api token changes', async () => {
		const fileRequest = deferred<File>()
		const transfers = createTransfersStub()
		const file = new File(['photo'], 'cat.jpg', { type: 'image/jpeg' })
		const handle = createDirectoryHandle('photos', [['cat.jpg', createFileHandle(fileRequest.promise)]])

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
		})

		await waitFor(() => expect(result.current.uploadFolderCanSubmit).toBe(true))

		act(() => {
			void result.current.handleUploadFolderSubmit()
		})

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			fileRequest.resolve(file)
			await Promise.resolve()
		})

		expect(transfers.queueUploadFiles).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.uploadFolderOpen).toBe(false)
		expect(result.current.uploadFolderSubmitting).toBe(false)
	})

	it('uses the shared local-folder required hint when prefix download submit runs without a picked folder', async () => {
		const transfers = createTransfersStub()

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
		})

		await act(async () => {
			await result.current.handleDownloadPrefixSubmit({ localFolder: '' })
		})

		expect(messageInfoMock).toHaveBeenCalledWith(selectLocalFolderFirstHint())
		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
	})

	it('uses the shared local-folder required hint when upload-folder submit runs without a picked folder', async () => {
		const transfers = createTransfersStub()

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
		})

		await act(async () => {
			await result.current.handleUploadFolderSubmit()
		})

		expect(messageInfoMock).toHaveBeenCalledWith(selectLocalFolderFirstHint())
		expect(transfers.queueUploadFiles).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
	})

	it('uses the shared empty-prefix hint when a picked download folder has no objects', async () => {
		const transfers = createTransfersStub()
		const handle = { name: 'restore-target' } as unknown as FileSystemDirectoryHandle
		const api = createApiStub(async () => ({
			items: [],
			commonPrefixes: [],
			isTruncated: false,
			nextContinuationToken: undefined,
		}))

		const { result } = renderHook(() =>
			useObjectsDownloadPrefix({
				api,
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
		})

		await waitFor(() => expect(result.current.downloadPrefixCanSubmit).toBe(true))

		await act(async () => {
			await result.current.handleDownloadPrefixSubmit({ localFolder: 'restore-target' })
		})

		expect(messageInfoMock).toHaveBeenCalledWith(noObjectsFoundUnderPrefixHint())
		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
	})

	it('uses the shared empty-folder hint when a picked upload folder has no files', async () => {
		const transfers = createTransfersStub()
		const handle = createDirectoryHandle('photos')

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
		})

		await waitFor(() => expect(result.current.uploadFolderCanSubmit).toBe(true))

		await act(async () => {
			await result.current.handleUploadFolderSubmit()
		})

		expect(messageInfoMock).toHaveBeenCalledWith(noFilesFoundInSelectedFolderHint())
		expect(transfers.queueUploadFiles).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
	})
})
