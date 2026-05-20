import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TransfersContextValue } from '../../../components/transfersTypes'
import { selectBucketFirstHint, selectObjectsFirstHint, selectProfileFirstHint } from '../../../lib/actionHints'
import { directoryPickerUnavailableHint, localFolderSelectionFailedHint } from '../../../lib/secureContext'
import { useObjectDownloads } from '../useObjectDownloads'

const { devicePickerSupportRef, pickDirectoryMock } = vi.hoisted(() => ({
	devicePickerSupportRef: { current: { ok: true } as { ok: boolean; reason?: string } },
	pickDirectoryMock: vi.fn(),
}))

const messageInfoMock = vi.fn()
const messageWarningMock = vi.fn()
const messageErrorMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			info: (...args: unknown[]) => messageInfoMock(...args),
			warning: (...args: unknown[]) => messageWarningMock(...args),
			error: (...args: unknown[]) => messageErrorMock(...args),
		},
	}
})

vi.mock('../../../lib/deviceFs', () => ({
	getDevicePickerSupport: () => devicePickerSupportRef.current,
	pickDirectory: (...args: unknown[]) => pickDirectoryMock(...args),
}))

function createTransfersStub(): TransfersContextValue {
	return {
		activeTab: 'downloads',
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

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

describe('useObjectDownloads', () => {
	afterEach(() => {
		devicePickerSupportRef.current = { ok: true }
		pickDirectoryMock.mockReset()
		messageInfoMock.mockClear()
		messageWarningMock.mockClear()
		messageErrorMock.mockClear()
	})

	it('uses the shared directory-picker fallback and zip fallback when multi-select device download is unavailable', async () => {
		devicePickerSupportRef.current = { ok: false }
		const transfers = createTransfersStub()
		const onZipObjects = vi.fn()

		const { result } = renderHook(() =>
			useObjectDownloads({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'folder/',
				selectedKeys: new Set(['folder/a.txt', 'folder/b.txt']),
				selectedCount: 2,
				objectByKey: new Map(),
				transfers,
				onZipObjects,
			}),
		)

		await act(async () => {
			await result.current.handleDownloadSelected()
		})

		expect(messageWarningMock).toHaveBeenCalledWith(directoryPickerUnavailableHint())
		expect(onZipObjects).toHaveBeenCalledWith(['folder/a.txt', 'folder/b.txt'])
		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
	})

	it('uses the shared directory-picker fallback when single-item device download is unavailable', async () => {
		devicePickerSupportRef.current = { ok: false }
		const transfers = createTransfersStub()

		const { result } = renderHook(() =>
			useObjectDownloads({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'folder/',
				selectedKeys: new Set(['folder/a.txt']),
				selectedCount: 1,
				objectByKey: new Map([
					['folder/a.txt', { key: 'folder/a.txt', size: 10, lastModified: '2026-04-23T00:00:00Z' }],
				]),
				transfers,
				onZipObjects: vi.fn(),
			}),
		)

		await act(async () => {
			await result.current.onDownloadToDevice('folder/a.txt', 10)
		})

		expect(messageWarningMock).toHaveBeenCalledWith(directoryPickerUnavailableHint())
		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
	})

	it('uses the shared local-folder failure hint when device folder selection throws without a message', async () => {
		const transfers = createTransfersStub()
		pickDirectoryMock.mockRejectedValueOnce({})

		const { result } = renderHook(() =>
			useObjectDownloads({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'folder/',
				selectedKeys: new Set(['folder/a.txt']),
				selectedCount: 1,
				objectByKey: new Map([
					['folder/a.txt', { key: 'folder/a.txt', size: 10, lastModified: '2026-04-23T00:00:00Z' }],
				]),
				transfers,
				onZipObjects: vi.fn(),
			}),
		)

		await act(async () => {
			await result.current.onDownloadToDevice('folder/a.txt', 10)
		})

		expect(messageErrorMock).toHaveBeenCalledWith(localFolderSelectionFailedHint())
		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
	})

	it('uses the shared profile prerequisite hint before device downloads', async () => {
		const transfers = createTransfersStub()

		const { result } = renderHook(() =>
			useObjectDownloads({
				apiToken: 'token-a',
				profileId: null,
				bucket: 'bucket-a',
				prefix: 'folder/',
				selectedKeys: new Set(['folder/a.txt']),
				selectedCount: 1,
				objectByKey: new Map(),
				transfers,
				onZipObjects: vi.fn(),
			}),
		)

		await act(async () => {
			await result.current.onDownloadToDevice('folder/a.txt', 10)
		})

		expect(messageInfoMock).toHaveBeenCalledWith(selectProfileFirstHint())
		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
	})

	it('uses the shared bucket prerequisite hint before normal downloads', () => {
		const transfers = createTransfersStub()

		const { result } = renderHook(() =>
			useObjectDownloads({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: '',
				prefix: 'folder/',
				selectedKeys: new Set(['folder/a.txt']),
				selectedCount: 1,
				objectByKey: new Map(),
				transfers,
				onZipObjects: vi.fn(),
			}),
		)

		act(() => {
			result.current.onDownload('folder/a.txt', 10)
		})

		expect(messageInfoMock).toHaveBeenCalledWith(selectBucketFirstHint())
		expect(transfers.queueDownloadObject).not.toHaveBeenCalled()
	})

	it('uses the shared object-selection prerequisite hint before batch downloads', async () => {
		const transfers = createTransfersStub()

		const { result } = renderHook(() =>
			useObjectDownloads({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'folder/',
				selectedKeys: new Set(),
				selectedCount: 0,
				objectByKey: new Map(),
				transfers,
				onZipObjects: vi.fn(),
			}),
		)

		await act(async () => {
			await result.current.handleDownloadSelected()
		})

		expect(messageInfoMock).toHaveBeenCalledWith(selectObjectsFirstHint())
		expect(transfers.queueDownloadObject).not.toHaveBeenCalled()
		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
	})

	it('does not queue a single device download when the object scope changes before the picker resolves', async () => {
		const transfers = createTransfersStub()
		const picker = createDeferred<FileSystemDirectoryHandle>()
		pickDirectoryMock.mockReturnValueOnce(picker.promise)
		const initialProps = {
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'folder/',
			selectedKeys: new Set(['folder/a.txt']),
			selectedCount: 1,
			objectByKey: new Map([['folder/a.txt', { key: 'folder/a.txt', size: 10, lastModified: '2026-04-23T00:00:00Z' }]]),
			transfers,
			onZipObjects: vi.fn(),
		}

		const { result, rerender } = renderHook((props: typeof initialProps) => useObjectDownloads(props), { initialProps })

		let pending!: Promise<void>
		act(() => {
			pending = result.current.onDownloadToDevice('folder/a.txt', 10)
		})
		rerender({ ...initialProps, apiToken: 'token-b' })

		await act(async () => {
			picker.resolve({ name: 'Downloads' } as FileSystemDirectoryHandle)
			await pending
		})

		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
	})

	it('does not queue a multi-select device download when the object scope changes before the picker resolves', async () => {
		const transfers = createTransfersStub()
		const picker = createDeferred<FileSystemDirectoryHandle>()
		pickDirectoryMock.mockReturnValueOnce(picker.promise)
		const initialProps = {
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'folder/',
			selectedKeys: new Set(['folder/a.txt', 'folder/b.txt']),
			selectedCount: 2,
			objectByKey: new Map([
				['folder/a.txt', { key: 'folder/a.txt', size: 10, lastModified: '2026-04-23T00:00:00Z' }],
				['folder/b.txt', { key: 'folder/b.txt', size: 20, lastModified: '2026-04-23T00:00:00Z' }],
			]),
			transfers,
			onZipObjects: vi.fn(),
		}

		const { result, rerender } = renderHook((props: typeof initialProps) => useObjectDownloads(props), { initialProps })

		let pending!: Promise<void>
		act(() => {
			pending = result.current.handleDownloadSelected()
		})
		rerender({ ...initialProps, profileId: 'profile-2' })

		await act(async () => {
			picker.resolve({ name: 'Downloads' } as FileSystemDirectoryHandle)
			await pending
		})

		expect(transfers.queueDownloadObjectsToDevice).not.toHaveBeenCalled()
		expect(transfers.openTransfers).not.toHaveBeenCalled()
	})
})
