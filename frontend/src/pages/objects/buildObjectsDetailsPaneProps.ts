import type { ObjectsPagePanesProps } from './ObjectsPagePanes'
import type { BuildObjectsPagePanesPropsArgs } from './buildObjectsPagePanesProps'

type DetailsProps = ObjectsPagePanesProps['detailsProps']

export function buildObjectsDetailsPaneProps(args: BuildObjectsPagePanesPropsArgs): DetailsProps {
	return {
		profileId: args.profileId,
		bucket: args.bucket,
		isAdvanced: args.isAdvanced,
		selectedCount: args.selectedCount,
		detailsKey: args.detailsKey,
		detailsMeta: args.detailsMeta,
		isMetaFetching: args.detailsMetaQueryIsFetching,
		isMetaError: args.detailsMetaQueryIsError,
		metaErrorMessage: args.detailsMetaErrorMessage,
		onRetryMeta: args.refetchDetailsMeta,
		onCopyKey: () => {
			if (!args.detailsKey) return
			args.onCopy(args.detailsKey)
		},
		onDownload: () => {
			if (!args.detailsKey) return
			args.onDownload(args.detailsKey, args.detailsMeta?.size ?? args.singleSelectedSize)
		},
		showPresignAction: args.presignedDownloadSupported,
		onPresign: () => {
			if (!args.detailsKey) return
			args.presignMutate(args.detailsKey)
		},
		isPresignLoading: args.presignPendingForKey,
		onCopyMove: (mode) => {
			if (!args.detailsKey) return
			args.openCopyMove(mode, args.detailsKey)
		},
		onDelete: () => {
			if (!args.detailsKey) return
			args.confirmDeleteObjects([args.detailsKey])
		},
		isDeleteLoading: args.detailsDeleteLoading,
		thumbnail: args.detailsThumbnail,
		previewThumbnail: args.detailsPreviewThumbnail,
		preview: args.preview,
		onLoadPreview: args.loadPreview,
		onCancelPreview: args.cancelPreview,
		canCancelPreview: args.canCancelPreview,
		onOpenLargePreview: args.openLargePreview,
		dockDetails: args.dockDetails,
		detailsOpen: args.detailsOpen,
		detailsDrawerOpen: args.detailsDrawerOpen,
		detailsDrawerSuspended: args.detailsDrawerSuspended,
		onOpenDetails: args.openDetails,
		onCloseDetails: () => args.setDetailsOpen(false),
		onCloseDrawer: () => args.setDetailsDrawerOpen(false),
		onResizePointerDown: args.onDetailsResizePointerDown,
		onResizePointerMove: args.onDetailsResizePointerMove,
		onResizePointerUp: args.onDetailsResizePointerUp,
	}
}
