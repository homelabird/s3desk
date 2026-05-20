import { useCallback } from 'react'

import type {
	ObjectsLocationVm,
	ObjectsOperationVm,
	ObjectsPaneVm,
	ObjectsScreenArgs,
	ObjectsSelectionVm,
} from './objectsScreenTypes'
import { useObjectDownloads } from './useObjectDownloads'
import { useObjectsClipboard } from './useObjectsClipboard'
import { useObjectsDnd } from './useObjectsDnd'

type UseObjectsScreenListActionRuntimeArgs = Pick<ObjectsScreenArgs, 'props' | 'actions' | 'previewState'> & {
	locationVm: ObjectsLocationVm
	selectionVm: ObjectsSelectionVm
	operationVm: ObjectsOperationVm
	paneVm: ObjectsPaneVm
}

export function useObjectsScreenListActionRuntime({
	props,
	locationVm,
	selectionVm,
	operationVm,
	paneVm,
	actions,
	previewState,
}: UseObjectsScreenListActionRuntimeArgs) {
	const { bucket, prefix } = locationVm
	const { selectedCount, selectedKeys, setLastSelectedObjectKey, setSelectedKeys } = selectionVm
	const { createJobWithRetry, queryClient, transfers, zipObjectsJobMutation } = operationVm
	const { canDragDrop, isDesktop } = paneVm
	const { presignMutation } = actions
	const { objectByKey } = previewState

	const { onDownload, onDownloadToDevice, handleDownloadSelected } = useObjectDownloads({
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucket,
		prefix,
		selectedKeys,
		selectedCount,
		objectByKey,
		transfers,
		onZipObjects: (keys) => zipObjectsJobMutation.mutate({ keys }),
	})

	const handlePresign = useCallback(
		(key: string) => {
			const item = objectByKey.get(key)
			presignMutation.mutate({
				key,
				size: item?.size,
				lastModified: item?.lastModified,
			})
		},
		[objectByKey, presignMutation],
	)

	const {
		clipboardObjects,
		onCopy,
		copySelectionToClipboard,
		pasteClipboardObjects,
	} = useObjectsClipboard({
		profileId: props.profileId,
		apiToken: props.apiToken,
		bucket,
		prefix,
		selectedKeys,
		createJobWithRetry,
		queryClient,
	})

	const {
		dndHoverPrefix,
		normalizeDropTargetPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		onRowDragStartObjects,
		onRowDragStartPrefix,
		clearDndHover,
	} = useObjectsDnd({
		profileId: props.profileId,
		apiToken: props.apiToken,
		bucket,
		prefix,
		canDragDrop,
		isDesktop,
		selectedKeys,
		setSelectedKeys,
		setLastSelectedObjectKey,
		createJobWithRetry,
		queryClient,
	})

	return {
		clipboardObjects,
		onCopy,
		copySelectionToClipboard,
		pasteClipboardObjects,
		dndHoverPrefix,
		normalizeDropTargetPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		onRowDragStartObjects,
		onRowDragStartPrefix,
		clearDndHover,
		onDownload,
		onDownloadToDevice,
		handleDownloadSelected,
		onPresign: handlePresign,
	}
}

export type ObjectsScreenListActionRuntime = ReturnType<typeof useObjectsScreenListActionRuntime>
