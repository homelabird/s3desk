import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { ObjectsPageHeaderProps } from './ObjectsPageHeader'
import type {
	ObjectsListVm,
	ObjectsLocationVm,
	ObjectsOperationVm,
	ObjectsPaneVm,
	ObjectsScreenArgs,
	ObjectsSelectionVm,
} from './objectsScreenTypes'
import type { ObjectsScreenListState } from './useObjectsScreenList'
import { useObjectsToolbarProps } from './useObjectsToolbarProps'
import { useObjectsTopMenus } from './useObjectsTopMenus'

type Args = Pick<ObjectsScreenArgs, 'props' | 'actions' | 'refresh'> & {
	locationVm: ObjectsLocationVm
	listVm: ObjectsListVm
	selectionVm: ObjectsSelectionVm
	operationVm: ObjectsOperationVm
	paneVm: ObjectsPaneVm
	listState: ObjectsScreenListState
}

export function useObjectsScreenToolbar({
	props,
	locationVm,
	listVm,
	selectionVm,
	operationVm,
	paneVm,
	actions,
	refresh,
	listState,
}: Args) {
	const showToolbarLabels = paneVm.isDesktop ? !!paneVm.screens.xl : !!paneVm.screens.md

	const { topMoreMenu } = useObjectsTopMenus({
		isAdvanced: listVm.isAdvanced,
		profileId: props.profileId,
		bucket: locationVm.bucket,
		prefix: locationVm.prefix,
		dockTree: paneVm.dockTree,
		globalActionMap: listState.globalActionMap,
		currentPrefixActionMap: listState.currentPrefixActionMap,
	})

	const { toolbarProps, canCreateFolder, createFolderTooltipText } = useObjectsToolbarProps({
		apiToken: props.apiToken,
		isDesktop: paneVm.isDesktop,
		showLabels: showToolbarLabels,
		isAdvanced: listVm.isAdvanced,
		isOffline: operationVm.isOffline,
		profileId: props.profileId,
		bucket: locationVm.bucket,
		recentBuckets: locationVm.recentBuckets,
		selectedCount: selectionVm.selectedCount,
		bucketOptions: listVm.bucketOptions,
		bucketsLoading: listVm.bucketsQuery.isFetching,
		onBucketDropdownVisibleChange: paneVm.handleBucketDropdownVisibleChange,
		canGoBack: locationVm.canGoBack,
		canGoForward: locationVm.canGoForward,
		canGoUp: locationVm.canGoUp,
		onGoBack: locationVm.goBack,
		onGoForward: locationVm.goForward,
		onGoUp: locationVm.onUp,
		uploadEnabled: operationVm.uploadSupported,
		uploadDisabledReason: operationVm.uploadDisabledReason,
		onUpload: actions.openUploadPicker,
		objectCrudSupported: operationVm.objectCrudSupported,
		profileCapabilities: operationVm.profileCapabilities,
		topMoreMenu,
		showPrimaryActions: !listVm.isAdvanced,
		primaryDownloadAction: listState.downloadSelectionAction,
		primaryDeleteAction: listState.deleteSelectionAction,
		activeTransferCount: operationVm.transfers.activeTransferCount,
		onOpenTransfers: () => operationVm.transfers.openTransfers(),
		dockTree: paneVm.dockTree,
		treeDrawerOpen: paneVm.treeDrawerOpen,
		dockDetails: paneVm.dockDetails,
		detailsDrawerOpen: paneVm.detailsDrawerOpen,
		onOpenTree: () => paneVm.setTreeDrawerOpen(true),
		onOpenDetails: () => paneVm.setDetailsDrawerOpen(true),
		onNewFolder: () => actions.openNewFolder(),
		onRefresh: () => void refresh(),
		isRefreshing: listState.listIsFetching,
		prefixByBucketRef: locationVm.prefixByBucketRef,
		navigateToLocation: locationVm.navigateToLocation,
	})

	const toolbarSectionProps: ObjectsPageHeaderProps['toolbarSectionProps'] = {
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucketsErrorMessage: listVm.bucketsQuery.isError ? formatErr(listVm.bucketsQuery.error) : null,
		isAdvanced: listVm.isAdvanced,
		tabs: locationVm.tabs,
		activeTabId: locationVm.activeTabId,
		onTabChange: locationVm.setActiveTabId,
		onTabAdd: locationVm.addTab,
		onTabClose: locationVm.closeTab,
		tabLabelMaxWidth: paneVm.screens.md ? 320 : 220,
		toolbarProps,
	}

	return {
		canCreateFolder,
		createFolderTooltipText,
		toolbarSectionProps,
	}
}
