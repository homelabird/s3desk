import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { ObjectsPageHeaderProps } from './ObjectsPageHeader'
import type { ObjectsScreenArgs } from './objectsScreenTypes'
import type { ObjectsScreenListState } from './useObjectsScreenList'
import { useObjectsToolbarProps } from './useObjectsToolbarProps'
import { useObjectsTopMenus } from './useObjectsTopMenus'

type Args = Pick<ObjectsScreenArgs, 'props' | 'data' | 'actions' | 'refresh'> & {
	listState: ObjectsScreenListState
}

export function useObjectsScreenToolbar({ props, data, actions, refresh, listState }: Args) {
	const { topMoreMenu } = useObjectsTopMenus({
		isAdvanced: data.isAdvanced,
		profileId: props.profileId,
		bucket: data.bucket,
		prefix: data.prefix,
		dockTree: data.dockTree,
		globalActionMap: listState.globalActionMap,
		currentPrefixActionMap: listState.currentPrefixActionMap,
	})

	const { toolbarProps, canCreateFolder, createFolderTooltipText } = useObjectsToolbarProps({
		apiToken: props.apiToken,
		isDesktop: !!data.screens.lg,
		showLabels: !!data.screens.sm,
		isAdvanced: data.isAdvanced,
		isOffline: data.isOffline,
		profileId: props.profileId,
		bucket: data.bucket,
		recentBuckets: data.recentBuckets,
		selectedCount: data.selectedCount,
		bucketOptions: data.bucketOptions,
		bucketsLoading: data.bucketsQuery.isFetching,
		onBucketDropdownVisibleChange: data.handleBucketDropdownVisibleChange,
		canGoBack: data.canGoBack,
		canGoForward: data.canGoForward,
		canGoUp: data.canGoUp,
		onGoBack: data.goBack,
		onGoForward: data.goForward,
		onGoUp: data.onUp,
		uploadEnabled: data.uploadSupported,
		uploadDisabledReason: data.uploadDisabledReason,
		onUpload: actions.openUploadPicker,
		objectCrudSupported: data.objectCrudSupported,
		profileCapabilities: data.profileCapabilities,
		topMoreMenu,
		showPrimaryActions: !data.isAdvanced,
		primaryDownloadAction: listState.downloadSelectionAction,
		primaryDeleteAction: listState.deleteSelectionAction,
		activeTransferCount: data.transfers.activeTransferCount,
		onOpenTransfers: () => data.transfers.openTransfers(),
		dockTree: data.dockTree,
		dockDetails: data.dockDetails,
		onOpenTree: () => data.setTreeDrawerOpen(true),
		onOpenDetails: () => data.setDetailsDrawerOpen(true),
		onNewFolder: () => actions.openNewFolder(),
		onRefresh: () => void refresh(),
		isRefreshing: listState.listIsFetching,
		prefixByBucketRef: data.prefixByBucketRef,
		navigateToLocation: data.navigateToLocation,
	})

	const toolbarSectionProps: ObjectsPageHeaderProps['toolbarSectionProps'] = {
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucketsErrorMessage: data.bucketsQuery.isError ? formatErr(data.bucketsQuery.error) : null,
		isAdvanced: data.isAdvanced,
		tabs: data.tabs,
		activeTabId: data.activeTabId,
		onTabChange: data.setActiveTabId,
		onTabAdd: data.addTab,
		onTabClose: data.closeTab,
		tabLabelMaxWidth: data.screens.md ? 320 : 220,
		toolbarProps,
	}

	return {
		canCreateFolder,
		createFolderTooltipText,
		toolbarSectionProps,
	}
}
