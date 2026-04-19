import { describe, expect, it, vi } from 'vitest'

import { buildUploadsPagePresentationProps } from '../buildUploadsPagePresentationProps'

describe('buildUploadsPagePresentationProps', () => {
	it('maps state into shell presentation props', () => {
		const queueUpload = vi.fn()
		const clearSelection = vi.fn()
		const setBucket = vi.fn()
		const setPrefix = vi.fn()
		const setUploadSourceOpen = vi.fn()
		const chooseUploadFiles = vi.fn()
		const chooseUploadFolder = vi.fn()
		const openTransfers = vi.fn()

		const presentation = buildUploadsPagePresentationProps({
			transfers: {
				openTransfers,
			} as never,
			isOffline: false,
			bucket: 'primary-bucket',
			setBucket,
			prefix: 'photos/',
			setPrefix,
			selectedFiles: [new File(['x'], 'demo.txt')],
			selectedFileCount: 1,
			selectionKind: 'files',
			uploadSourceOpen: true,
			setUploadSourceOpen,
			uploadSourceBusy: false,
			selectedProfile: { id: 'profile-1', name: 'Primary Profile', provider: 's3_compatible' } as never,
			uploadsSupported: true,
			uploadsUnsupportedReason: null,
			bucketsQuery: {
				isError: false,
				error: null,
				isFetching: false,
				data: [{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }],
				isFetched: true,
			} as never,
			bucketOptions: [{ label: 'primary-bucket', value: 'primary-bucket' }],
			showBucketsEmpty: false,
			canQueueUpload: true,
			queueDisabledReason: null,
			folderSelectionSupport: { ok: true, mode: 'picker' },
			destinationLabel: 's3://primary-bucket/photos/',
			clearSelection,
			queueUpload,
			openUploadPicker: vi.fn(),
			chooseUploadFiles,
			chooseUploadFolder,
		})

		expect(presentation.header.subtitle).toContain('Primary Profile profile is active')
		expect(presentation.header.queueButtonLabel).toBe('Queue upload (1)')
		expect(presentation.header.queueButtonDisabled).toBe(false)
		expect(presentation.targetSource.bucketValue).toBe('primary-bucket')
		expect(presentation.targetSource.onBucketChange).toBe(setBucket)
		expect(presentation.targetSource.prefixValue).toBe('photos/')
		expect(presentation.targetSource.onPrefixChange).toBe(setPrefix)
		expect(presentation.selection.selectedFiles).toHaveLength(1)
		expect(presentation.uploadSourceSheet.open).toBe(true)

		presentation.header.onQueueUpload()
		presentation.header.onOpenTransfers()
		presentation.header.onClearSelection()
		presentation.uploadSourceSheet.onClose()
		presentation.uploadSourceSheet.onSelectFiles()
		presentation.uploadSourceSheet.onSelectFolder()

		expect(queueUpload).toHaveBeenCalledTimes(1)
		expect(openTransfers).toHaveBeenCalledWith('uploads')
		expect(clearSelection).toHaveBeenCalledTimes(1)
		expect(setUploadSourceOpen).toHaveBeenCalledWith(false)
		expect(chooseUploadFiles).toHaveBeenCalledTimes(1)
		expect(chooseUploadFolder).toHaveBeenCalledTimes(1)
	})
})
