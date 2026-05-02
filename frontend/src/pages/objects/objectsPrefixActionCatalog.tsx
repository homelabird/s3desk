import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FolderAddOutlined, FolderOutlined, SnippetsOutlined } from '@ant-design/icons'

import type { UIAction, UIActionOrDivider } from './objectsActions'
import type { ObjectsActionDeps } from './objectsActionCatalogTypes'

export function buildPrefixActions(deps: ObjectsActionDeps, targetPrefix: string): UIActionOrDivider[] {
	const canUsePrefixActions = !!deps.profileId && !!deps.bucket && !deps.isOffline && deps.objectCrudSupported
	const openAction: UIAction = {
		id: 'open',
		label: 'Open',
		icon: <FolderOutlined />,
		keywords: 'open folder enter',
		enabled: canUsePrefixActions,
		run: () => deps.onOpenPrefix(targetPrefix),
	}
	const newSubfolderAction: UIAction = {
		id: 'new_subfolder',
		label: 'New subfolder…',
		icon: <FolderAddOutlined />,
		keywords: 'mkdir new folder create',
		enabled: canUsePrefixActions,
		run: () => deps.onOpenNewFolder(targetPrefix),
	}
	const copyAction: UIAction = {
		id: 'copy',
		label: 'Copy folder path',
		icon: <CopyOutlined />,
		keywords: 'copy clipboard path',
		enabled: true,
		audience: 'advanced',
		run: () => deps.onCopy(targetPrefix),
	}
	const downloadZipAction: UIAction = {
		id: 'downloadZip',
		label: 'Download folder (zip)',
		shortLabel: 'Download zip',
		icon: <DownloadOutlined />,
		keywords: 'download zip folder client',
		enabled: canUsePrefixActions,
		audience: 'advanced',
		run: () => deps.onZipPrefix(targetPrefix),
	}
	const renameAction: UIAction = {
		id: 'rename',
		label: 'Rename folder…',
		icon: <EditOutlined />,
		keywords: 'rename folder',
		enabled: canUsePrefixActions,
		audience: 'advanced',
		run: () => deps.onOpenRenamePrefix(targetPrefix),
	}
	const deleteAction: UIAction = {
		id: 'delete',
		label: 'Delete folder…',
		icon: <DeleteOutlined />,
		keywords: 'delete remove rm folder',
		danger: true,
		enabled: canUsePrefixActions,
		audience: 'advanced',
		run: () => deps.onConfirmDeletePrefixAsJob(false, targetPrefix),
	}
	const copyJobAction: UIAction = {
		id: 'copyJob',
		label: 'Copy folder…',
		icon: <SnippetsOutlined />,
		keywords: 'copy cp folder job',
		enabled: canUsePrefixActions,
		audience: 'advanced',
		run: () => deps.onOpenCopyPrefix('copy', targetPrefix),
	}
	const moveJobAction: UIAction = {
		id: 'moveJob',
		label: 'Move folder…',
		icon: <EditOutlined />,
		keywords: 'move mv folder job',
		danger: true,
		enabled: canUsePrefixActions,
		audience: 'advanced',
		run: () => deps.onOpenCopyPrefix('move', targetPrefix),
	}
	const downloadToDeviceAction: UIAction = {
		id: 'downloadToDevice',
		label: 'Download to folder…',
		icon: <DownloadOutlined />,
		keywords: 'download folder device local',
		enabled: canUsePrefixActions,
		audience: 'advanced',
		run: () => deps.onOpenDownloadPrefix(targetPrefix),
	}
	const deleteDryAction: UIAction = {
		id: 'deleteDry',
		label: 'Dry run delete folder…',
		icon: <DeleteOutlined />,
		keywords: 'preview dry-run safe delete rm folder',
		danger: true,
		enabled: canUsePrefixActions,
		audience: 'advanced',
		run: () => deps.onConfirmDeletePrefixAsJob(true, targetPrefix),
	}

	return [
		openAction,
		newSubfolderAction,
		copyAction,
		{ type: 'divider' },
		downloadZipAction,
		downloadToDeviceAction,
		{ type: 'divider' },
		renameAction,
		copyJobAction,
		moveJobAction,
		{ type: 'divider' },
		deleteAction,
		deleteDryAction,
	]
}
