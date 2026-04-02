import type { Dispatch, SetStateAction } from 'react'

import type { APIClient } from '../../api/client'
import type { Job, JobCreateRequest } from '../../api/types'
import type { TransfersContextValue } from '../../components/Transfers'
import type { ObjectTypeFilter } from './objectsTypes'
import { useObjectsDetailsActions } from './useObjectsDetailsActions'
import { useObjectsPageDialogActions } from './useObjectsPageDialogActions'
import { useObjectsPageUploadActions } from './useObjectsPageUploadActions'
import { useObjectsSelectionEffects } from './useObjectsSelectionEffects'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsPageActionsArgs = {
	api: APIClient
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	dockDetails: boolean
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
	isOffline: boolean
	uploadSupported: boolean
	uploadDisabledReason?: string | null
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
	isOffline,
	uploadSupported,
	uploadDisabledReason,
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
		apiToken,
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

	const detailsActions = useObjectsDetailsActions({
		dockDetails,
		setDetailsOpen,
		setDetailsDrawerOpen,
		setSelectedKeys,
		setLastSelectedObjectKey,
	})

	const dialogActions = useObjectsPageDialogActions({
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
	})

	const uploadActions = useObjectsPageUploadActions({
		apiToken,
		profileId,
		bucket,
		prefix,
		isOffline,
		uploadSupported,
		uploadDisabledReason,
		transfers,
	})

	return {
		handleFavoriteSelect,
		...detailsActions,
		...dialogActions,
		...uploadActions,
	}
}

export type ObjectsPageActionsState = ReturnType<typeof useObjectsPageActions>
