import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { APIClientShape } from '../../../api/client'
import type { TransfersContextValue } from '../../../components/transfersTypes'
import {
	noObjectsFoundUnderPrefixHint,
	selectLocalFolderFirstHint,
} from '../../../lib/secureContext'
import { useObjectsDownloadPrefix } from '../useObjectsDownloadPrefix'

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

type ListObjectsArgs = {
	prefix?: string
	continuationToken?: string
	signal?: AbortSignal
}

function createApiStub(listObjects: (args: ListObjectsArgs) => Promise<ListObjectsResponse>): APIClientShape {
	return {
		objects: {
			listObjects: vi.fn(listObjects),
		},
	} as unknown as APIClientShape
}

function createTransfersStub(): TransfersContextValue {
	return {
		activeTab: 'uploads',
		closeTransfers: vi.fn(),
		clearFinishedTransfers: vi.fn(),
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
		let requestSignal: AbortSignal | undefined
		const api = createApiStub((args) => {
			requestSignal = args.signal
			return listRequest.promise
		})

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

		let pending!: Promise<void>
		act(() => {
			pending = result.current.handleDownloadPrefixSubmit({ localFolder: 'restore-target' })
		})

		act(() => {
			result.current.handleDownloadPrefixCancel()
		})

		await act(async () => {
			listRequest.resolve({
				items: [{ key: 'logs/app.log', size: 128 }],
				commonPrefixes: [],
				isTruncated: true,
				nextContinuationToken: 'page-2',
			})
			await pending
		})

		expect(requestSignal?.aborted).toBe(true)
		expect(api.objects.listObjects).toHaveBeenCalledTimes(1)
		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.downloadPrefixOpen).toBe(false)
		expect(result.current.downloadPrefixSubmitting).toBe(false)
	})

	it('lists and queues the prefix selected from a folder action', async () => {
		const transfers = createTransfersStub()
		const handle = { name: 'restore-target' } as unknown as FileSystemDirectoryHandle
		const api = createApiStub(async () => ({
			items: [{ key: 'logs/archive/app.log', size: 128 }],
			commonPrefixes: [],
			isTruncated: false,
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
			result.current.openDownloadPrefix('logs/archive/')
			result.current.handleDownloadPrefixPick(handle)
		})
		await waitFor(() => expect(result.current.downloadPrefixCanSubmit).toBe(true))

		expect(result.current.downloadPrefixSourcePrefix).toBe('logs/archive/')
		await act(async () => {
			await result.current.handleDownloadPrefixSubmit({ localFolder: 'restore-target' })
		})

		expect(api.objects.listObjects).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'logs/archive/' }))
		expect(transfers.queueDownloadObjectsToDevice).toHaveBeenCalledWith(
			expect.objectContaining({ prefix: 'logs/archive/' }),
		)
	})

	it('ignores stale prefix-download responses after the api token changes', async () => {
		const listRequest = deferred<ListObjectsResponse>()
		const transfers = createTransfersStub()
		const handle = { name: 'restore-target' } as unknown as FileSystemDirectoryHandle
		let requestSignal: AbortSignal | undefined
		const api = createApiStub((args) => {
			requestSignal = args.signal
			return listRequest.promise
		})

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

		let pending!: Promise<void>
		act(() => {
			pending = result.current.handleDownloadPrefixSubmit({ localFolder: 'restore-target' })
		})

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			listRequest.resolve({
				items: [{ key: 'logs/app.log', size: 128 }],
				commonPrefixes: [],
				isTruncated: true,
				nextContinuationToken: 'page-2',
			})
			await pending
		})

		expect(requestSignal?.aborted).toBe(true)
		expect(api.objects.listObjects).toHaveBeenCalledTimes(1)
		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
		expect(result.current.downloadPrefixOpen).toBe(false)
		expect(result.current.downloadPrefixSubmitting).toBe(false)

		rerender({ apiToken: 'token-1' })

		expect(result.current.downloadPrefixOpen).toBe(false)
		expect(result.current.downloadPrefixSubmitting).toBe(false)
		expect(result.current.downloadPrefixSourcePrefix).toBe('')
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

})
