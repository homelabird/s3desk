import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { UploadSourceSheetProps } from '../../components/UploadSourceSheet'
import type { UploadsSelectionSectionProps } from './UploadsSelectionSection'
import type { UploadsPageState } from './useUploadsPageState'

export type UploadsPagePresentationProps = {
	header: {
		subtitle: string
		queueButtonLabel: string
		queueButtonDisabled: boolean
		queueButtonTooltip: string
		onQueueUpload: () => void
		onOpenTransfers: () => void
		onClearSelection: () => void
		clearSelectionDisabled: boolean
	}
	alerts: {
		showOffline: boolean
		showUnsupported: boolean
		unsupportedDescription: string | null
		bucketsErrorDescription: string | null
	}
	emptyState: {
		showBucketsEmpty: boolean
	}
	targetSource: {
		show: boolean
		destinationLabel: string
		bucketValue: string
		onBucketChange: (value: string) => void
		bucketPlaceholder: string
		bucketDisabled: boolean
		bucketOptions: Array<{ label: string; value: string }>
		prefixValue: string
		onPrefixChange: (value: string) => void
		prefixDisabled: boolean
	}
	selection: UploadsSelectionSectionProps
	uploadSourceSheet: UploadSourceSheetProps
}

export function buildUploadsPagePresentationProps(state: UploadsPageState): UploadsPagePresentationProps {
	return {
		header: {
			subtitle: state.selectedProfile
				? `${state.selectedProfile.name} profile is active. Choose a bucket, stage files from this device, and queue an upload job.`
				: 'Choose a bucket, stage files from this device, and queue an upload job.',
			queueButtonLabel: `Queue upload${state.selectedFileCount > 0 ? ` (${state.selectedFileCount})` : ''}`,
			queueButtonDisabled: !state.canQueueUpload,
			queueButtonTooltip: state.queueDisabledReason ?? 'Queue selected files as an upload job',
			onQueueUpload: state.queueUpload,
			onOpenTransfers: () => state.transfers.openTransfers('uploads'),
			onClearSelection: state.clearSelection,
			clearSelectionDisabled: state.selectedFiles.length === 0,
		},
		alerts: {
			showOffline: state.isOffline,
			showUnsupported: !state.uploadsSupported,
			unsupportedDescription: state.uploadsUnsupportedReason,
			bucketsErrorDescription: state.bucketsQuery.isError ? formatErr(state.bucketsQuery.error) : null,
		},
		emptyState: {
			showBucketsEmpty: state.showBucketsEmpty,
		},
		targetSource: {
			show: !state.showBucketsEmpty,
			destinationLabel: state.destinationLabel,
			bucketValue: state.bucket,
			onBucketChange: state.setBucket,
			bucketPlaceholder: state.bucketsQuery.isFetching && !state.bucketsQuery.data ? 'Loading buckets…' : 'Bucket…',
			bucketDisabled: state.isOffline || !state.uploadsSupported || (state.bucketsQuery.isFetching && !state.bucketsQuery.data),
			bucketOptions: state.bucketOptions.map((option) => ({ value: option.value, label: option.label })),
			prefixValue: state.prefix,
			onPrefixChange: state.setPrefix,
			prefixDisabled: state.isOffline || !state.uploadsSupported,
		},
		selection: {
			onOpenPicker: state.openUploadPicker,
			isOffline: state.isOffline,
			uploadsSupported: state.uploadsSupported,
			queueDisabledReason: state.queueDisabledReason,
			selectedFiles: state.selectedFiles,
			destinationLabel: state.destinationLabel,
			selectionKind: state.selectionKind,
		},
		uploadSourceSheet: {
			open: state.uploadSourceOpen,
			title: 'Add upload source',
			destinationLabel: state.destinationLabel,
			folderSelectionSupported: state.folderSelectionSupport.ok,
			folderSelectionReason: state.folderSelectionSupport.reason,
			busy: state.uploadSourceBusy,
			onClose: () => {
				if (state.uploadSourceBusy) return
				state.setUploadSourceOpen(false)
			},
			onSelectFiles: () => void state.chooseUploadFiles(),
			onSelectFolder: () => void state.chooseUploadFolder(),
		},
	}
}
