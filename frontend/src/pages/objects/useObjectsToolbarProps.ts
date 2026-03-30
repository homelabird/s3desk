import { useCallback, useMemo, type MutableRefObject } from 'react'

import type { ProviderCapabilityMatrix } from '../../lib/providerCapabilities'
import { getProviderCapabilityReason } from '../../lib/providerCapabilities'
import type { ObjectsToolbarProps } from './ObjectsToolbar'
import type { UIAction } from './objectsActions'

export function useObjectsToolbarProps(args: {
	apiToken: string
	isDesktop: boolean
	showLabels: boolean
	isAdvanced: boolean
	isOffline: boolean
	profileId: string | null
	bucket: string
	recentBuckets: string[]
	selectedCount: number
	bucketOptions: Array<{ label: string; value: string }>
	bucketsLoading: boolean
	onBucketDropdownVisibleChange?: (open: boolean) => void
	canGoBack: boolean
	canGoForward: boolean
	canGoUp: boolean
	onGoBack: () => void
	onGoForward: () => void
	onGoUp: () => void
	uploadEnabled: boolean
	uploadDisabledReason?: string | null
	onUpload: () => void
	objectCrudSupported: boolean
	profileCapabilities: ProviderCapabilityMatrix | null
	topMoreMenu: ObjectsToolbarProps['topMoreMenu']
	showPrimaryActions: boolean
	primaryDownloadAction?: UIAction
	primaryDeleteAction?: UIAction
	activeTransferCount: number
	onOpenTransfers: () => void
	dockTree: boolean
	dockDetails: boolean
	onOpenTree: () => void
	onOpenDetails: () => void
	onNewFolder: () => void
	onRefresh: () => void
	isRefreshing: boolean
	prefixByBucketRef: MutableRefObject<Record<string, string>>
	navigateToLocation: (bucket: string, prefix: string, opts: { recordHistory: boolean }) => void
}): { toolbarProps: ObjectsToolbarProps; canCreateFolder: boolean; createFolderTooltipText: string } {
	const {
		apiToken,
		isDesktop,
		showLabels,
		isAdvanced,
		isOffline,
		profileId,
		bucket,
		recentBuckets,
		selectedCount,
		bucketOptions,
		bucketsLoading,
		onBucketDropdownVisibleChange,
		canGoBack,
		canGoForward,
		canGoUp,
		onGoBack,
		onGoForward,
		onGoUp,
		uploadEnabled,
		uploadDisabledReason,
		onUpload,
		objectCrudSupported,
		profileCapabilities,
		topMoreMenu,
		showPrimaryActions,
		primaryDownloadAction,
		primaryDeleteAction,
		activeTransferCount,
		onOpenTransfers,
		dockTree,
		dockDetails,
		onOpenTree,
		onOpenDetails,
		onNewFolder,
		onRefresh,
		isRefreshing,
		prefixByBucketRef,
		navigateToLocation,
	} = args

	const handleBucketChange = useCallback(
		(value: string | null) => {
			const nextBucket = value ?? ''
			if (!nextBucket) {
				navigateToLocation('', '', { recordHistory: true })
				return
			}
			const saved = prefixByBucketRef.current[nextBucket]
			navigateToLocation(nextBucket, saved ?? '', { recordHistory: true })
		},
		[navigateToLocation, prefixByBucketRef],
	)

	const canCreateFolder = !!profileId && !!bucket && !isOffline && objectCrudSupported
	const createFolderTooltipText = !profileId
		? 'Select a profile first'
		: isOffline
			? 'Offline: check your network connection'
			: !bucket
				? 'Select a bucket first'
				: !objectCrudSupported
					? getProviderCapabilityReason(profileCapabilities, 'objectCrud', 'Selected provider does not support object APIs.') ??
						'Selected provider does not support object APIs.'
					: 'Create a new folder marker object'

	const toolbarProps = useMemo<ObjectsToolbarProps>(
		() => ({
			isDesktop,
			showLabels,
			isAdvanced,
			isOffline,
			hasProfile: !!profileId,
			bucketPickerScopeKey: `${apiToken || '__no_server__'}:${profileId?.trim() || '__no_profile__'}`,
			bucket,
			recentBuckets,
			selectedCount,
			bucketOptions,
			bucketsLoading,
			onBucketChange: handleBucketChange,
			onBucketDropdownVisibleChange,
			canGoBack,
			canGoForward,
			canGoUp,
			onGoBack,
			onGoForward,
			onGoUp,
			uploadEnabled,
			uploadDisabledReason,
			onUpload,
			canCreateFolder,
			createFolderTooltipText,
			onNewFolder,
			onRefresh,
			isRefreshing,
			topMoreMenu,
			showPrimaryActions,
			primaryDownloadAction,
			primaryDeleteAction,
			activeTransferCount,
			onOpenTransfers,
			dockTree,
			dockDetails,
			onOpenTree,
			onOpenDetails,
		}),
		[
			activeTransferCount,
			apiToken,
			bucket,
			bucketOptions,
			bucketsLoading,
			canGoBack,
			canGoForward,
			canGoUp,
			dockDetails,
			dockTree,
			isAdvanced,
			isDesktop,
			isOffline,
			isRefreshing,
			onBucketDropdownVisibleChange,
			onGoBack,
			onGoForward,
			onGoUp,
			onNewFolder,
			onOpenDetails,
			onOpenTransfers,
			onOpenTree,
			onRefresh,
			onUpload,
			primaryDeleteAction,
			primaryDownloadAction,
			profileId,
			recentBuckets,
			selectedCount,
			showLabels,
			showPrimaryActions,
			topMoreMenu,
			uploadDisabledReason,
			uploadEnabled,
			canCreateFolder,
			createFolderTooltipText,
			handleBucketChange,
		],
	)

	return {
		toolbarProps,
		canCreateFolder,
		createFolderTooltipText,
	}
}
