import { act, renderHook, waitFor } from '@testing-library/react'
import type { DragEvent as ReactDragEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TransfersContextValue } from '../../../components/Transfers'
import { useObjectsUploadDrop } from '../useObjectsUploadDrop'

const messageErrorMock = vi.fn()
const messageInfoMock = vi.fn()
const messageOpenMock = vi.fn()
const messageWarningMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			error: (...args: unknown[]) => messageErrorMock(...args),
			info: (...args: unknown[]) => messageInfoMock(...args),
			open: (...args: unknown[]) => messageOpenMock(...args),
			warning: (...args: unknown[]) => messageWarningMock(...args),
		},
	}
})

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

function createExternalUploadEvent(files: File[] = []): ReactDragEvent {
	return {
		preventDefault: vi.fn(),
		stopPropagation: vi.fn(),
		dataTransfer: {
			dropEffect: 'copy',
			effectAllowed: 'copy',
			files: files as unknown as FileList,
			items: [] as unknown as DataTransferItemList,
			types: ['Files'],
			getData: () => '',
			setData: vi.fn(),
			clearData: vi.fn(),
			setDragImage: vi.fn(),
		} as unknown as DataTransfer,
	} as unknown as ReactDragEvent
}

describe('useObjectsUploadDrop', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		messageErrorMock.mockClear()
		messageInfoMock.mockClear()
		messageOpenMock.mockClear()
		messageWarningMock.mockClear()
	})

	it('resets the drop highlight when the browser drag session ends', async () => {
		const transfers = createTransfersStub()
		const { result } = renderHook(() =>
			useObjectsUploadDrop({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'folder/',
				isOffline: false,
				uploadsEnabled: true,
				uploadsDisabledReason: null,
				transfers,
			}),
		)

		act(() => {
			result.current.onUploadDragEnter(createExternalUploadEvent())
		})

		expect(result.current.uploadDropActive).toBe(true)

		act(() => {
			window.dispatchEvent(new Event('blur'))
		})

		await waitFor(() => {
			expect(result.current.uploadDropActive).toBe(false)
		})
	})

	it('queues dropped files and clears the active drop state', async () => {
		const transfers = createTransfersStub()
		const file = new File(['alpha'], 'alpha.txt', { type: 'text/plain' })
		const { result } = renderHook(() =>
			useObjectsUploadDrop({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'folder/',
				isOffline: false,
				uploadsEnabled: true,
				uploadsDisabledReason: null,
				transfers,
			}),
		)

		act(() => {
			result.current.onUploadDragEnter(createExternalUploadEvent([file]))
		})

		expect(result.current.uploadDropActive).toBe(true)

		act(() => {
			result.current.onUploadDrop(createExternalUploadEvent([file]))
		})

		await waitFor(() => {
			expect((transfers.queueUploadFiles as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
		})

		expect((transfers.queueUploadFiles as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'folder/',
			files: [file],
		})
		expect((transfers.openTransfers as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('uploads')
		expect(result.current.uploadDropActive).toBe(false)
	})
})
