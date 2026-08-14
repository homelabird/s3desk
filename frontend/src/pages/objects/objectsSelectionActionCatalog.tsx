import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, SnippetsOutlined } from '@ant-design/icons'

import type { UIAction } from './objectsActions'
import type { ObjectsActionDeps } from './objectsActionCatalogTypes'

export function buildSelectionActions(deps: ObjectsActionDeps): UIAction[] {
	const canUseSelectionActions = !!deps.profileId && !!deps.bucket && !deps.isOffline && deps.objectCrudSupported
	const selectionIsBulk = deps.selectedCount > 1
	return [
		{
			id: 'download_selected',
			label: selectionIsBulk ? 'Download selection…' : 'Download (client)',
			shortLabel: 'Download',
			icon: <DownloadOutlined />,
			keywords: selectionIsBulk ? 'download selection folder' : 'download client',
			enabled: canUseSelectionActions && deps.selectedCount > 0,
			run: () => deps.onDownloadSelected(),
		},
		{
			id: 'move_selected_to',
			label: selectionIsBulk ? 'Move selection to…' : 'Move to…',
			shortLabel: 'Move to…',
			icon: <EditOutlined />,
			keywords: 'move destination folder target',
			enabled: canUseSelectionActions && deps.selectedCount > 0,
			run: () => deps.onOpenMoveSelected(),
		},
		{
			id: 'copy_selected_keys',
			label: 'Copy',
			shortLabel: 'Copy',
			shortcut: 'Ctrl/Cmd+C',
			icon: <CopyOutlined />,
			keywords: 'clipboard ctrl+c',
			enabled: deps.selectedCount > 0,
			run: () => deps.onCopySelectionToClipboard('copy'),
		},
		{
			id: 'cut_selected_keys',
			label: 'Cut',
			shortLabel: 'Cut',
			shortcut: 'Ctrl/Cmd+X',
			icon: <EditOutlined />,
			keywords: 'clipboard ctrl+x move',
			enabled: deps.selectedCount > 0,
			run: () => deps.onCopySelectionToClipboard('move'),
		},
		{
			id: 'paste_keys',
			label: deps.clipboardObjects?.mode === 'move' ? 'Paste (Move)…' : 'Paste',
			shortcut: 'Ctrl/Cmd+V',
			icon: <SnippetsOutlined />,
			keywords: 'clipboard ctrl+v',
			enabled: !!deps.profileId && !!deps.bucket && (!!deps.clipboardObjects || !!navigator.clipboard?.readText),
			run: () => deps.onPasteClipboardObjects(),
		},
		{
			id: 'clear_selection',
			label: 'Clear selection (Esc)',
			shortLabel: 'Clear',
			icon: <DeleteOutlined />,
			keywords: 'unselect escape',
			enabled: deps.selectedCount > 0,
			run: () => deps.onClearSelection(),
		},
		{
			id: 'delete_selected',
			label: deps.selectedCount > 1 ? 'Delete selection (Del)…' : 'Delete (Del)…',
			shortLabel: 'Delete',
			icon: <DeleteOutlined />,
			keywords: 'delete remove',
			danger: true,
			enabled: deps.selectedCount > 0,
			run: () => deps.onConfirmDeleteSelected(),
		},
	]
}
