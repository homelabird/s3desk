import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, InfoCircleOutlined, LinkOutlined, SearchOutlined, SnippetsOutlined } from '@ant-design/icons'

import type { UIAction, UIActionOrDivider } from './objectsActions'
import type { ObjectsActionDeps } from './objectsActionCatalogTypes'
import { isImageKey } from './objectsListUtils'

export function buildObjectActions(deps: ObjectsActionDeps, objectKey: string, objectSize?: number): UIActionOrDivider[] {
	const canUseObjectActions = !!deps.profileId && !!deps.bucket && !deps.isOffline && deps.objectCrudSupported
	const downloadAction: UIAction = {
		id: 'download',
		label: 'Download (client)',
		shortLabel: 'Download',
		icon: <DownloadOutlined />,
		keywords: 'download client save',
		enabled: canUseObjectActions,
		run: () => deps.onDownload(objectKey, objectSize),
	}
	const downloadDeviceAction: UIAction = {
		id: 'download_device',
		label: 'Download to folder…',
		shortLabel: 'Download to folder',
		icon: <DownloadOutlined />,
		keywords: 'download folder local device',
		enabled: canUseObjectActions,
		audience: 'advanced',
		run: () => deps.onDownloadToDevice(objectKey, objectSize),
	}
	const presignAction: UIAction = {
		id: 'presign',
		label: 'Link…',
		icon: <LinkOutlined />,
		keywords: 'url link download',
		enabled: canUseObjectActions,
		audience: 'advanced',
		run: () => deps.onPresign(objectKey),
	}
	const copyAction: UIAction = {
		id: 'copy',
		label: 'Copy key',
		icon: <CopyOutlined />,
		keywords: 'copy clipboard',
		enabled: true,
		audience: 'advanced',
		run: () => deps.onCopy(objectKey),
	}
	const detailsAction: UIAction = {
		id: 'details',
		label: 'Details',
		icon: <InfoCircleOutlined />,
		keywords: 'details metadata preview',
		enabled: canUseObjectActions,
		audience: 'advanced',
		run: () => deps.onOpenDetailsForKey(objectKey),
	}
	const largePreviewAction: UIAction | null = isImageKey(objectKey)
		? {
				id: 'open_large_preview',
				label: 'Open large preview',
				icon: <SearchOutlined />,
				keywords: 'preview image zoom large',
				enabled: canUseObjectActions,
				run: () => deps.onOpenLargePreviewForKey(objectKey),
			}
		: null
	const renameAction: UIAction = {
		id: 'rename',
		label: 'Rename (F2)…',
		icon: <EditOutlined />,
		keywords: 'rename f2',
		enabled: canUseObjectActions,
		audience: 'advanced',
		run: () => deps.onOpenRenameObject(objectKey),
	}
	const deleteAction: UIAction = {
		id: 'delete',
		label: 'Delete (Del)…',
		icon: <DeleteOutlined />,
		keywords: 'delete remove',
		danger: true,
		enabled: canUseObjectActions,
		run: () => deps.onConfirmDeleteObjects([objectKey]),
	}

	const jobActions: UIActionOrDivider[] = [
		{
			id: 'copyJob',
			label: 'Copy…',
			icon: <SnippetsOutlined />,
			keywords: 'copy duplicate job',
			enabled: canUseObjectActions,
			audience: 'advanced',
			run: () => deps.onOpenCopyMove('copy', objectKey),
		},
		{
			id: 'moveJob',
			label: 'Move/Rename…',
			icon: <EditOutlined />,
			keywords: 'move rename mv job',
			enabled: canUseObjectActions,
			audience: 'advanced',
			run: () => deps.onOpenCopyMove('move', objectKey),
		},
	]

	return [
		downloadAction,
		downloadDeviceAction,
		...(deps.presignedDownloadSupported ? [presignAction] : []),
		{ type: 'divider' },
		copyAction,
		...(largePreviewAction ? [largePreviewAction] : []),
		detailsAction,
		{ type: 'divider' },
		renameAction,
		...jobActions,
		{ type: 'divider' },
		deleteAction,
	]
}
