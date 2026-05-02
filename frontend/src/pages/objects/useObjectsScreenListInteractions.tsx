import type {
	ObjectsListVm,
	ObjectsLocationVm,
	ObjectsOperationVm,
	ObjectsPaneVm,
	ObjectsScreenArgs,
	ObjectsSelectionVm,
} from './objectsScreenTypes'
import { useObjectsScreenListActionRuntime } from './useObjectsScreenListActionRuntime'
import { useObjectsScreenListRendering } from './useObjectsScreenListRendering'

type UseObjectsScreenListInteractionsArgs = Pick<
	ObjectsScreenArgs,
	'props' | 'actions' | 'previewState' | 'viewportState' | 'refresh'
> & {
	locationVm: ObjectsLocationVm
	listVm: ObjectsListVm
	selectionVm: ObjectsSelectionVm
	operationVm: ObjectsOperationVm
	paneVm: ObjectsPaneVm
}

export function useObjectsScreenListInteractions(args: UseObjectsScreenListInteractionsArgs) {
	const runtime = useObjectsScreenListActionRuntime({
		props: args.props,
		locationVm: args.locationVm,
		selectionVm: args.selectionVm,
		operationVm: args.operationVm,
		paneVm: args.paneVm,
		actions: args.actions,
		previewState: args.previewState,
	})
	const rendering = useObjectsScreenListRendering({ ...args, runtime })

	return {
		...rendering,
		copySelectionToClipboard: runtime.copySelectionToClipboard,
		dndHoverPrefix: runtime.dndHoverPrefix,
		normalizeDropTargetPrefix: runtime.normalizeDropTargetPrefix,
		onCopy: runtime.onCopy,
		onDownload: runtime.onDownload,
		onPresign: runtime.onPresign,
		onDndTargetDragLeave: runtime.onDndTargetDragLeave,
		onDndTargetDragOver: runtime.onDndTargetDragOver,
		onDndTargetDrop: runtime.onDndTargetDrop,
		onUploadDragEnter: args.actions.onUploadDragEnter,
		onUploadDragLeave: args.actions.onUploadDragLeave,
		onUploadDragOver: args.actions.onUploadDragOver,
		onUploadDrop: args.actions.onUploadDrop,
		pasteClipboardObjects: runtime.pasteClipboardObjects,
		showUploadDropOverlay:
			args.actions.uploadDropActive &&
			!!args.props.profileId &&
			!!args.locationVm.bucket &&
			!args.operationVm.isOffline &&
			args.operationVm.uploadSupported,
	}
}
