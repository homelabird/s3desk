import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UploadsPagePresentationProps } from '../buildUploadsPagePresentationProps'
import { UploadsPageShell } from '../UploadsPageShell'

const uploadsSelectionSectionMock = vi.fn()
const uploadSourceSheetMock = vi.fn()

vi.mock('../UploadsSelectionSection', () => ({
	UploadsSelectionSection: (props: unknown) => {
		uploadsSelectionSectionMock(props)
		return <div data-testid="uploads-selection-section" />
	},
}))

vi.mock('../../../components/UploadSourceSheet', () => ({
	UploadSourceSheet: (props: unknown) => {
		uploadSourceSheetMock(props)
		return <div data-testid="upload-source-sheet" />
	},
}))

beforeEach(() => {
	uploadsSelectionSectionMock.mockClear()
	uploadSourceSheetMock.mockClear()
})

function buildPresentation(overrides: Partial<UploadsPagePresentationProps> = {}): UploadsPagePresentationProps {
	const onQueueUpload = vi.fn()
	const onOpenTransfers = vi.fn()
	const onClearSelection = vi.fn()
	const onBucketChange = vi.fn()
	const onPrefixChange = vi.fn()
	const onOpenPicker = vi.fn()
	const onCloseUploadSource = vi.fn()
	const onSelectFiles = vi.fn()
	const onSelectFolder = vi.fn()

	return {
		header: {
			subtitle: 'Primary Profile profile is active. Choose a bucket, stage files from this device, and queue an upload job.',
			queueButtonLabel: 'Queue upload',
			queueButtonDisabled: true,
			queueButtonTooltip: 'Select a bucket first.',
			onQueueUpload,
			onOpenTransfers,
			onClearSelection,
			clearSelectionDisabled: true,
		},
		alerts: {
			showOffline: false,
			showUnsupported: false,
			unsupportedDescription: null,
			bucketsErrorDescription: null,
		},
		emptyState: {
			showBucketsEmpty: false,
		},
		targetSource: {
			show: true,
			destinationLabel: 's3://primary-bucket/photos/',
			bucketValue: 'primary-bucket',
			onBucketChange,
			bucketPlaceholder: 'Bucket…',
			bucketDisabled: false,
			bucketOptions: [{ label: 'primary-bucket', value: 'primary-bucket' }],
			prefixValue: 'photos/',
			onPrefixChange,
			prefixDisabled: false,
		},
		selection: {
			onOpenPicker,
			isOffline: false,
			uploadsSupported: true,
			queueDisabledReason: 'Select a bucket first.',
			selectedFiles: [],
			destinationLabel: 's3://primary-bucket/photos/',
			selectionKind: 'empty',
		},
		uploadSourceSheet: {
			open: false,
			title: 'Add upload source',
			destinationLabel: 's3://primary-bucket/photos/',
			folderSelectionSupported: true,
			folderSelectionReason: undefined,
			busy: false,
			onClose: onCloseUploadSource,
			onSelectFiles,
			onSelectFolder,
		},
		...overrides,
	}
}

describe('UploadsPageShell', () => {
	it('wires header actions and renders the empty bucket route hint', () => {
		const presentation = buildPresentation({
			header: {
				...buildPresentation().header,
				queueButtonLabel: 'Queue upload (1)',
				queueButtonDisabled: false,
				queueButtonTooltip: 'Queue selected files as an upload job',
				clearSelectionDisabled: false,
			},
			emptyState: {
				showBucketsEmpty: true,
			},
			targetSource: {
				...buildPresentation().targetSource,
				show: false,
			},
		})

		render(
			<MemoryRouter>
				<UploadsPageShell presentation={presentation} />
			</MemoryRouter>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Queue upload (1)' }))
		fireEvent.click(screen.getByRole('button', { name: 'Open Transfers' }))
		fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))

		expect(presentation.header.onQueueUpload).toHaveBeenCalledTimes(1)
		expect(presentation.header.onOpenTransfers).toHaveBeenCalledTimes(1)
		expect(presentation.header.onClearSelection).toHaveBeenCalledTimes(1)
		expect(screen.getByText('No buckets available')).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Go to Buckets' })).toBeInTheDocument()
		expect(uploadsSelectionSectionMock).not.toHaveBeenCalled()
	})

	it('passes selection and upload-source props through the shell', () => {
		const onClose = vi.fn()
		const presentation = buildPresentation({
			alerts: {
				showOffline: true,
				showUnsupported: true,
				unsupportedDescription: 'Uploads are disabled by backend policy.',
				bucketsErrorDescription: null,
			},
			selection: {
				...buildPresentation().selection,
				isOffline: true,
				uploadsSupported: false,
				selectedFiles: [new File(['x'], 'demo.txt')],
				selectionKind: 'files',
			},
			uploadSourceSheet: {
				...buildPresentation().uploadSourceSheet,
				open: true,
				busy: true,
				onClose,
			},
		})

		render(
			<MemoryRouter>
				<UploadsPageShell presentation={presentation} />
			</MemoryRouter>,
		)

		expect(screen.getByText('Offline: uploads are disabled.')).toBeInTheDocument()
		expect(screen.getByText('Uploads are not available for this provider')).toBeInTheDocument()
		expect(uploadsSelectionSectionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				isOffline: true,
				uploadsSupported: false,
				queueDisabledReason: 'Select a bucket first.',
				selectionKind: 'files',
			}),
		)
		expect(uploadSourceSheetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				open: true,
				busy: true,
				destinationLabel: 's3://primary-bucket/photos/',
			}),
		)

		const closeSheet = uploadSourceSheetMock.mock.calls[0][0].onClose as () => void
		closeSheet()
		expect(onClose).toHaveBeenCalledTimes(1)
	})
})
