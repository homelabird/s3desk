import type { ObjectsPageOverlaysProps } from './ObjectsPageOverlays'
import type { BuildObjectsPageOverlaysPropsArgs } from './buildObjectsPageOverlaysProps'
import { normalizePrefix } from './objectsListUtils'

type DialogOverlayProps = Pick<
	ObjectsPageOverlaysProps,
	| 'presignModalProps'
	| 'goToPathModalProps'
	| 'commandPaletteModalProps'
	| 'deletePrefixConfirmModalProps'
	| 'downloadPrefixModalProps'
	| 'copyPrefixModalProps'
	| 'copyMoveModalProps'
	| 'selectionMoveSheetProps'
	| 'newFolderModalProps'
	| 'renameModalProps'
>

export function buildObjectsDialogsProps(args: BuildObjectsPageOverlaysPropsArgs): DialogOverlayProps {
	const { actions, bucket, profileId } = args

	return {
		presignModalProps: actions.presignOpen
			? { open: actions.presignOpen, presign: actions.presign, onClose: actions.closePresign }
			: null,
		goToPathModalProps: args.pathModalOpen
			? {
				open: args.pathModalOpen,
				bucket,
				hasProfile: !!profileId,
				pathDraft: args.pathDraft,
				options: args.pathOptions,
				inputRef: args.pathInputRef,
				onChangeDraft: args.setPathDraft,
				onCommit: args.commitPathDraft,
				onClose: () => args.setPathModalOpen(false),
			}
			: null,
		commandPaletteModalProps: args.commandPaletteOpen
			? {
				open: args.commandPaletteOpen,
				query: args.commandPaletteQuery,
				commands: args.commandPaletteItems,
				activeIndex: args.commandPaletteActiveIndex,
				onQueryChange: args.onCommandPaletteQueryChange,
				onActiveIndexChange: args.setCommandPaletteActiveIndex,
				onRunCommand: args.runCommandPaletteItem,
				onCancel: args.closeCommandPalette,
				onKeyDown: args.onCommandPaletteKeyDown,
			}
			: null,
		deletePrefixConfirmModalProps: actions.deletePrefixConfirmOpen
			? {
				open: actions.deletePrefixConfirmOpen,
				dryRun: actions.deletePrefixConfirmDryRun,
				bucket,
				prefix: actions.deletePrefixConfirmPrefix,
				confirmText: actions.deletePrefixConfirmText,
				onConfirmTextChange: actions.setDeletePrefixConfirmText,
				hasProfile: !!profileId,
				hasBucket: !!bucket,
				isConfirming: actions.deletePrefixJobMutation.isPending,
				onConfirm: actions.handleDeletePrefixConfirm,
				onCancel: actions.handleDeletePrefixCancel,
				isSummaryFetching: actions.deletePrefixSummaryQuery.isFetching,
				summary: actions.deletePrefixSummary,
				summaryNotIndexed: actions.deletePrefixSummaryNotIndexed,
				isSummaryError: actions.deletePrefixSummaryQuery.isError,
				summaryErrorMessage: actions.deletePrefixSummaryError,
				onIndexPrefix: () => {
					if (!actions.deletePrefixConfirmPrefix) return
					args.indexObjectsJobMutation.mutate({ prefix: actions.deletePrefixConfirmPrefix, fullReindex: false })
				},
			}
			: null,
		downloadPrefixModalProps: actions.downloadPrefixOpen
			? {
				open: actions.downloadPrefixOpen,
				sourceLabel: bucket ? `s3://${bucket}/${normalizePrefix(args.prefix)}*` : '-',
				values: actions.downloadPrefixValues,
				onValuesChange: actions.setDownloadPrefixValues,
				isSubmitting: actions.downloadPrefixSubmitting,
				onCancel: actions.handleDownloadPrefixCancel,
				onFinish: actions.handleDownloadPrefixSubmit,
				onPickFolder: actions.handleDownloadPrefixPick,
				canSubmit: actions.downloadPrefixCanSubmit,
			}
			: null,
		copyPrefixModalProps: actions.copyPrefixOpen
			? {
				open: actions.copyPrefixOpen,
				mode: actions.copyPrefixMode,
				bucket,
				srcPrefix: actions.copyPrefixSrcPrefix,
				sourceLabel: actions.copyPrefixSrcPrefix ? `s3://${bucket}/${actions.copyPrefixSrcPrefix}*` : '-',
				values: actions.copyPrefixValues,
				onValuesChange: actions.setCopyPrefixValues,
				bucketOptions: args.bucketOptions,
				isBucketsLoading: args.bucketsLoading,
				isSubmitting: actions.copyPrefixSubmitting,
				onCancel: actions.handleCopyPrefixCancel,
				onFinish: actions.handleCopyPrefixSubmit,
				isSummaryFetching: actions.copyPrefixSummaryQuery.isFetching,
				summary: actions.copyPrefixSummary,
				summaryNotIndexed: actions.copyPrefixSummaryNotIndexed,
				isSummaryError: actions.copyPrefixSummaryQuery.isError,
				summaryErrorMessage: actions.copyPrefixSummaryError,
				onIndexPrefix: () => {
					if (!actions.copyPrefixSrcPrefix) return
					args.indexObjectsJobMutation.mutate({ prefix: actions.copyPrefixSrcPrefix, fullReindex: false })
				},
				normalizePrefix,
			}
			: null,
		copyMoveModalProps: actions.copyMoveOpen
			? {
				open: actions.copyMoveOpen,
				mode: actions.copyMoveMode,
				bucket,
				srcKey: actions.copyMoveSrcKey,
				values: actions.copyMoveValues,
				onValuesChange: actions.setCopyMoveValues,
				bucketOptions: args.bucketOptions,
				isBucketsLoading: args.bucketsLoading,
				isSubmitting: actions.copyMoveSubmitting,
				onCancel: actions.handleCopyMoveCancel,
				onFinish: actions.handleCopyMoveSubmit,
			}
			: null,
		selectionMoveSheetProps: actions.moveSelectionOpen
			? {
				open: actions.moveSelectionOpen,
				useBottomSheet: !args.isMd,
				selectedCount: args.selectedCount,
				bucket,
				prefix: normalizePrefix(args.prefix),
				values: actions.moveSelectionValues,
				onValuesChange: actions.setMoveSelectionValues,
				bucketOptions: args.bucketOptions,
				isBucketsLoading: args.bucketsLoading,
				isSubmitting: actions.moveSelectionSubmitting,
				onCancel: actions.handleMoveSelectionCancel,
				onFinish: actions.handleMoveSelectionSubmit,
			}
			: null,
		newFolderModalProps: actions.newFolderOpen
			? {
				open: actions.newFolderOpen,
				parentLabel: bucket ? `s3://${bucket}/${normalizePrefix(actions.newFolderParentPrefix)}` : '-',
				parentPrefix: actions.newFolderParentPrefix,
				errorMessage: actions.newFolderError,
				partialKey: actions.newFolderPartialKey,
				onOpenPrefix: args.onOpenPrefix,
				values: actions.newFolderValues,
				onValuesChange: actions.setNewFolderValues,
				isSubmitting: actions.newFolderSubmitting,
				onCancel: actions.handleNewFolderCancel,
				onFinish: actions.handleNewFolderSubmit,
			}
			: null,
		renameModalProps: actions.renameOpen
			? {
				open: actions.renameOpen,
				kind: actions.renameKind,
				source: actions.renameSource,
				bucket,
				values: actions.renameValues,
				onValuesChange: actions.setRenameValues,
				isSubmitting: actions.renameSubmitting,
				onCancel: actions.handleRenameCancel,
				onFinish: actions.handleRenameSubmit,
			}
			: null,
	}
}
