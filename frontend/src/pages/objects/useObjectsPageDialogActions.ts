import type { Dispatch, SetStateAction } from 'react'

import type { APIClient } from '../../api/client'
import type { Job, JobCreateRequest } from '../../api/types'
import type { TransfersContextValue } from '../../components/Transfers'
import type { ObjectTypeFilter } from './objectsTypes'
import { splitLines } from './objectsListUtils'
import { useObjectsCopyMove } from './useObjectsCopyMove'
import { useObjectsDelete } from './useObjectsDelete'
import { useObjectsDeleteConfirm } from './useObjectsDeleteConfirm'
import { useObjectsDownloadPrefix } from './useObjectsDownloadPrefix'
import { useObjectsNewFolder } from './useObjectsNewFolder'
import { useObjectsPrefixSummary } from './useObjectsPrefixSummary'
import { useObjectsPresign } from './useObjectsPresign'
import { useObjectsRename } from './useObjectsRename'
import { useObjectsSelectionMove } from './useObjectsSelectionMove'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type Args = {
	api: APIClient
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	downloadLinkProxyEnabled: boolean
	presignedDownloadSupported: boolean
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
	selectedKeys: Set<string>
	setSelectedKeys: Dispatch<SetStateAction<Set<string>>>
}

export function useObjectsPageDialogActions({
	api,
	apiToken,
	profileId,
	bucket,
	prefix,
	downloadLinkProxyEnabled,
	presignedDownloadSupported,
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
	selectedKeys,
	setSelectedKeys,
}: Args) {
	const renameActions = useObjectsRename({
		profileId,
		apiToken,
		bucket,
		createJobWithRetry,
	})

	const presignActions = useObjectsPresign({
		api,
		apiToken,
		profileId,
		bucket,
		downloadLinkProxyEnabled,
		presignedDownloadSupported,
	})

	const copyMoveActions = useObjectsCopyMove({
		profileId,
		apiToken,
		bucket,
		prefix,
		createJobWithRetry,
		splitLines,
	})

	const selectionMoveActions = useObjectsSelectionMove({
		profileId,
		apiToken,
		bucket,
		prefix,
		selectedKeys,
		createJobWithRetry,
		setSelectedKeys,
	})

	const deleteActions = useObjectsDelete({
		api,
		profileId,
		apiToken,
		bucket,
		prefix,
		createJobWithRetry,
		setSelectedKeys,
	})

	const newFolderActions = useObjectsNewFolder({
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

	const downloadPrefixActions = useObjectsDownloadPrefix({
		api,
		apiToken,
		profileId,
		bucket,
		prefix,
		transfers,
	})

	const deleteConfirmActions = useObjectsDeleteConfirm({
		apiToken,
		profileId,
		bucket,
		prefix,
		selectedKeys,
		deleteMutation: deleteActions.deleteMutation,
		deletePrefixJobMutation: deleteActions.deletePrefixJobMutation,
	})

	const deletePrefixSummaryState = useObjectsPrefixSummary({
		api,
		profileId,
		bucket,
		prefix: deleteConfirmActions.deletePrefixConfirmPrefix,
		apiToken,
		enabled: deleteConfirmActions.deletePrefixConfirmOpen,
	})

	const copyPrefixSummaryState = useObjectsPrefixSummary({
		api,
		profileId,
		bucket,
		prefix: copyMoveActions.copyPrefixSrcPrefix,
		apiToken,
		enabled: copyMoveActions.copyPrefixOpen,
	})

	return {
		...renameActions,
		...presignActions,
		...copyMoveActions,
		...selectionMoveActions,
		...deleteActions,
		...newFolderActions,
		...downloadPrefixActions,
		...deleteConfirmActions,
		deletePrefixSummaryQuery: deletePrefixSummaryState.summaryQuery,
		deletePrefixSummary: deletePrefixSummaryState.summary,
		deletePrefixSummaryNotIndexed: deletePrefixSummaryState.summaryNotIndexed,
		deletePrefixSummaryError: deletePrefixSummaryState.summaryError,
		copyPrefixSummaryQuery: copyPrefixSummaryState.summaryQuery,
		copyPrefixSummary: copyPrefixSummaryState.summary,
		copyPrefixSummaryNotIndexed: copyPrefixSummaryState.summaryNotIndexed,
		copyPrefixSummaryError: copyPrefixSummaryState.summaryError,
	}
}
