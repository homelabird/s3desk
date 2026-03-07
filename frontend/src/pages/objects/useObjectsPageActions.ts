import type { Dispatch, SetStateAction } from 'react'

import type { APIClient } from '../../api/client'
import type { Job, JobCreateRequest } from '../../api/types'
import type { TransfersContextValue } from '../../components/Transfers'
import type { ObjectTypeFilter } from './objectsTypes'
import { splitLines } from './objectsListUtils'
import { useObjectsCopyMove } from './useObjectsCopyMove'
import { useObjectsDelete } from './useObjectsDelete'
import { useObjectsDeleteConfirm } from './useObjectsDeleteConfirm'
import { useObjectsDetailsActions } from './useObjectsDetailsActions'
import { useObjectsDownloadPrefix } from './useObjectsDownloadPrefix'
import { useObjectsNewFolder } from './useObjectsNewFolder'
import { useObjectsPrefixSummary } from './useObjectsPrefixSummary'
import { useObjectsPresign } from './useObjectsPresign'
import { useObjectsRename } from './useObjectsRename'
import { useObjectsSelectionEffects } from './useObjectsSelectionEffects'
import { useObjectsUploadDrop } from './useObjectsUploadDrop'
import { useObjectsUploadFolder } from './useObjectsUploadFolder'
import { useObjectsUploadPickers } from './useObjectsUploadPickers'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsPageActionsArgs = {
	api: APIClient
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	dockDetails: boolean
	downloadLinkProxyEnabled: boolean
	createJobWithRetry: CreateJobWithRetry
	typeFilter: ObjectTypeFilter
	favoritesOnly: boolean
	deferredSearch: string
	clearSearch: () => void
	setFavoritesOnly: (next: boolean) => void
	setTypeFilter: (next: ObjectTypeFilter) => void
	refreshTreeNode: (key: string) => Promise<void> | void
	onOpenPrefix: (nextPrefix: string) => void
	transfers: TransfersContextValue
	isOffline: boolean
	uploadSupported: boolean
	uploadDisabledReason?: string | null
	moveAfterUploadDefault: boolean
	cleanupEmptyDirsDefault: boolean
	selectedKeys: Set<string>
	setSelectedKeys: Dispatch<SetStateAction<Set<string>>>
	setLastSelectedObjectKey: Dispatch<SetStateAction<string | null>>
	favoritesOpenDetails: boolean
	navigateToLocation: (bucket: string, prefix: string, options: { recordHistory: boolean }) => void
	setDetailsOpen: Dispatch<SetStateAction<boolean>>
	setDetailsDrawerOpen: Dispatch<SetStateAction<boolean>>
	setTreeDrawerOpen: Dispatch<SetStateAction<boolean>>
}

export function useObjectsPageActions({
	api,
	apiToken,
	profileId,
	bucket,
	prefix,
	dockDetails,
	downloadLinkProxyEnabled,
	createJobWithRetry,
	typeFilter,
	favoritesOnly,
	deferredSearch,
	clearSearch,
	setFavoritesOnly,
	setTypeFilter,
	refreshTreeNode,
	onOpenPrefix,
	transfers,
	isOffline,
	uploadSupported,
	uploadDisabledReason,
	moveAfterUploadDefault,
	cleanupEmptyDirsDefault,
	selectedKeys,
	setSelectedKeys,
	setLastSelectedObjectKey,
	favoritesOpenDetails,
	navigateToLocation,
	setDetailsOpen,
	setDetailsDrawerOpen,
	setTreeDrawerOpen,
}: UseObjectsPageActionsArgs) {
	const { handleFavoriteSelect } = useObjectsSelectionEffects({
		bucket,
		prefix,
		profileId,
		favoritesOpenDetails,
		navigateToLocation,
		setDetailsOpen,
		setDetailsDrawerOpen,
		setTreeDrawerOpen,
		setSelectedKeys,
		setLastSelectedObjectKey,
	})

	const { openDetails, openDetailsForKey, toggleDetails } = useObjectsDetailsActions({
		dockDetails,
		setDetailsOpen,
		setDetailsDrawerOpen,
		setSelectedKeys,
		setLastSelectedObjectKey,
	})

	const {
		renameOpen,
		renameKind,
		renameSource,
		renameValues,
		setRenameValues,
		renameSubmitting,
		openRenameObject,
		openRenamePrefix,
		handleRenameSubmit,
		handleRenameCancel,
	} = useObjectsRename({
		profileId,
		bucket,
		createJobWithRetry,
	})

	const { presignOpen, presign, presignKey, presignMutation, closePresign } = useObjectsPresign({
		api,
		profileId,
		bucket,
		downloadLinkProxyEnabled,
	})

	const {
		copyMoveOpen,
		copyMoveMode,
		copyMoveSrcKey,
		copyMoveValues,
		setCopyMoveValues,
		copyMoveSubmitting,
		openCopyMove,
		handleCopyMoveSubmit,
		handleCopyMoveCancel,
		copyPrefixOpen,
		copyPrefixMode,
		copyPrefixSrcPrefix,
		copyPrefixValues,
		setCopyPrefixValues,
		copyPrefixSubmitting,
		openCopyPrefix,
		handleCopyPrefixSubmit,
		handleCopyPrefixCancel,
	} = useObjectsCopyMove({
		profileId,
		bucket,
		prefix,
		createJobWithRetry,
		splitLines,
	})

	const { deletingKey, deleteMutation, deletePrefixJobMutation } = useObjectsDelete({
		api,
		profileId,
		bucket,
		prefix,
		createJobWithRetry,
		setSelectedKeys,
	})

	const {
		newFolderOpen,
		newFolderValues,
		setNewFolderValues,
		newFolderSubmitting,
		newFolderError,
		newFolderPartialKey,
		newFolderParentPrefix,
		openNewFolder,
		handleNewFolderSubmit,
		handleNewFolderCancel,
	} = useObjectsNewFolder({
		api,
		apiToken,
		profileId,
		bucket,
		prefix,
		typeFilter,
		favoritesOnly,
		searchText: deferredSearch,
		onClearSearch: clearSearch,
		onDisableFavoritesOnly: () => setFavoritesOnly(false),
		onShowFolders: () => setTypeFilter('all'),
		refreshTreeNode,
		onOpenPrefix,
	})

	const {
		downloadPrefixOpen,
		downloadPrefixValues,
		setDownloadPrefixValues,
		downloadPrefixSubmitting,
		downloadPrefixCanSubmit,
		openDownloadPrefix,
		handleDownloadPrefixSubmit,
		handleDownloadPrefixCancel,
		handleDownloadPrefixPick,
	} = useObjectsDownloadPrefix({
		api,
		profileId,
		bucket,
		prefix,
		transfers,
	})

	const {
		uploadDropActive,
		startUploadFromFiles,
		onUploadDragEnter,
		onUploadDragLeave,
		onUploadDragOver,
		onUploadDrop,
	} = useObjectsUploadDrop({
		profileId,
		bucket,
		prefix,
		isOffline,
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
		transfers,
	})

	const {
		deletePrefixConfirmOpen,
		deletePrefixConfirmDryRun,
		deletePrefixConfirmPrefix,
		deletePrefixConfirmText,
		setDeletePrefixConfirmText,
		confirmDeleteObjects,
		confirmDeleteSelected,
		confirmDeletePrefixAsJob,
		handleDeletePrefixConfirm,
		handleDeletePrefixCancel,
	} = useObjectsDeleteConfirm({
		profileId,
		bucket,
		prefix,
		selectedKeys,
		deleteMutation,
		deletePrefixJobMutation,
	})

	const {
		summaryQuery: deletePrefixSummaryQuery,
		summary: deletePrefixSummary,
		summaryNotIndexed: deletePrefixSummaryNotIndexed,
		summaryError: deletePrefixSummaryError,
	} = useObjectsPrefixSummary({
		api,
		profileId,
		bucket,
		prefix: deletePrefixConfirmPrefix,
		apiToken,
		enabled: deletePrefixConfirmOpen,
	})

	const {
		summaryQuery: copyPrefixSummaryQuery,
		summary: copyPrefixSummary,
		summaryNotIndexed: copyPrefixSummaryNotIndexed,
		summaryError: copyPrefixSummaryError,
	} = useObjectsPrefixSummary({
		api,
		profileId,
		bucket,
		prefix: copyPrefixSrcPrefix,
		apiToken,
		enabled: copyPrefixOpen,
	})

	const {
		uploadFolderOpen,
		uploadFolderValues,
		setUploadFolderValues,
		uploadFolderSubmitting,
		uploadFolderCanSubmit,
		openUploadFolderModal,
		handleUploadFolderSubmit,
		handleUploadFolderCancel,
		handleUploadFolderPick,
	} = useObjectsUploadFolder({
		profileId,
		bucket,
		prefix,
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
		transfers,
		defaultMoveAfterUpload: moveAfterUploadDefault,
		defaultCleanupEmptyDirs: cleanupEmptyDirsDefault,
	})

	const {
		uploadFilesInputRef,
		uploadFolderInputRef,
		onUploadFilesInputChange,
		onUploadFolderInputChange,
		openUploadFilesPicker,
		openUploadFolderPicker,
	} = useObjectsUploadPickers({
		isOffline,
		uploadsEnabled: uploadSupported,
		uploadsDisabledReason: uploadDisabledReason,
		startUploadFromFiles,
		openUploadFolderModal,
	})

	return {
		handleFavoriteSelect,
		openDetails,
		openDetailsForKey,
		toggleDetails,
		renameOpen,
		renameKind,
		renameSource,
		renameValues,
		setRenameValues,
		renameSubmitting,
		openRenameObject,
		openRenamePrefix,
		handleRenameSubmit,
		handleRenameCancel,
		presignOpen,
		presign,
		presignKey,
		presignMutation,
		closePresign,
		copyMoveOpen,
		copyMoveMode,
		copyMoveSrcKey,
		copyMoveValues,
		setCopyMoveValues,
		copyMoveSubmitting,
		openCopyMove,
		handleCopyMoveSubmit,
		handleCopyMoveCancel,
		copyPrefixOpen,
		copyPrefixMode,
		copyPrefixSrcPrefix,
		copyPrefixValues,
		setCopyPrefixValues,
		copyPrefixSubmitting,
		openCopyPrefix,
		handleCopyPrefixSubmit,
		handleCopyPrefixCancel,
		deletingKey,
		deleteMutation,
		deletePrefixJobMutation,
		newFolderOpen,
		newFolderValues,
		setNewFolderValues,
		newFolderSubmitting,
		newFolderError,
		newFolderPartialKey,
		newFolderParentPrefix,
		openNewFolder,
		handleNewFolderSubmit,
		handleNewFolderCancel,
		downloadPrefixOpen,
		downloadPrefixValues,
		setDownloadPrefixValues,
		downloadPrefixSubmitting,
		downloadPrefixCanSubmit,
		openDownloadPrefix,
		handleDownloadPrefixSubmit,
		handleDownloadPrefixCancel,
		handleDownloadPrefixPick,
		uploadDropActive,
		startUploadFromFiles,
		onUploadDragEnter,
		onUploadDragLeave,
		onUploadDragOver,
		onUploadDrop,
		deletePrefixConfirmOpen,
		deletePrefixConfirmDryRun,
		deletePrefixConfirmPrefix,
		deletePrefixConfirmText,
		setDeletePrefixConfirmText,
		confirmDeleteObjects,
		confirmDeleteSelected,
		confirmDeletePrefixAsJob,
		handleDeletePrefixConfirm,
		handleDeletePrefixCancel,
		deletePrefixSummaryQuery,
		deletePrefixSummary,
		deletePrefixSummaryNotIndexed,
		deletePrefixSummaryError,
		copyPrefixSummaryQuery,
		copyPrefixSummary,
		copyPrefixSummaryNotIndexed,
		copyPrefixSummaryError,
		uploadFolderOpen,
		uploadFolderValues,
		setUploadFolderValues,
		uploadFolderSubmitting,
		uploadFolderCanSubmit,
		openUploadFolderModal,
		handleUploadFolderSubmit,
		handleUploadFolderCancel,
		handleUploadFolderPick,
		uploadFilesInputRef,
		uploadFolderInputRef,
		onUploadFilesInputChange,
		onUploadFolderInputChange,
		openUploadFilesPicker,
		openUploadFolderPicker,
	}
}

export type ObjectsPageActionsState = ReturnType<typeof useObjectsPageActions>
