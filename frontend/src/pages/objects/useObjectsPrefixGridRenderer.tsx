import { useCallback } from 'react'
import { Button, Typography } from 'antd'
import { EllipsisOutlined, FolderOutlined } from '@ant-design/icons'

import styles from './ObjectsGridCards.module.css'
import { ObjectsMenuPopover } from './ObjectsMenuPopover'
import type { UseObjectsGridRenderersArgs } from './objectsGridRendererTypes'
import { buildActionMenu } from './objectsActions'
import { displayNameForPrefix } from './objectsListUtils'
import { onActivateFromKeyboard } from './objectsGridRendererUtils'

type UseObjectsPrefixGridRendererArgs = Pick<
	UseObjectsGridRenderersArgs,
	| 'canDragDrop'
	| 'clearDndHover'
	| 'closeContextMenu'
	| 'contextMenuState'
	| 'getPrefixActions'
	| 'highlightText'
	| 'isAdvanced'
	| 'dndHoverPrefix'
	| 'normalizeDropTargetPrefix'
	| 'onOpenPrefix'
	| 'onDndTargetDragOver'
	| 'onDndTargetDragLeave'
	| 'onDndTargetDrop'
	| 'onRowDragStartPrefix'
	| 'openPrefixContextMenu'
	| 'prefix'
	| 'recordContextMenuPoint'
	| 'withContextMenuClassName'
>

export function useObjectsPrefixGridRenderer(args: UseObjectsPrefixGridRendererArgs) {
	const {
		canDragDrop,
		clearDndHover,
		closeContextMenu,
		contextMenuState,
		getPrefixActions,
		highlightText,
		isAdvanced,
		dndHoverPrefix,
		normalizeDropTargetPrefix,
		onOpenPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		onRowDragStartPrefix,
		openPrefixContextMenu,
		prefix,
		recordContextMenuPoint,
		withContextMenuClassName,
	} = args

	return useCallback(
		(prefixKey: string) => {
			const displayName = displayNameForPrefix(prefixKey, prefix)
			const dropTargetPrefix = normalizeDropTargetPrefix(prefixKey)
			const menu = withContextMenuClassName(buildActionMenu(getPrefixActions(prefixKey), isAdvanced))
			const buttonMenuOpen =
				contextMenuState.open &&
				contextMenuState.kind === 'prefix' &&
				contextMenuState.key === prefixKey &&
				contextMenuState.source === 'button'
			return (
				<div key={prefixKey} className={styles.gridCardShell} role="listitem">
					<div
						className={`${styles.gridCard} ${styles.gridCardDropTarget} ${canDragDrop && dndHoverPrefix === dropTargetPrefix ? styles.gridCardDropActive : ''}`}
						onClick={() => onOpenPrefix(prefixKey)}
						onContextMenu={(event) => {
							event.preventDefault()
							event.stopPropagation()
							const point = recordContextMenuPoint(event)
							openPrefixContextMenu(prefixKey, 'context', point)
						}}
						onDragOver={(event) => onDndTargetDragOver(event, prefixKey)}
						onDragLeave={(event) => onDndTargetDragLeave(event, prefixKey)}
						onDrop={(event) => onDndTargetDrop(event, prefixKey)}
						onKeyDown={(event) => onActivateFromKeyboard(event, () => onOpenPrefix(prefixKey))}
						draggable={canDragDrop}
						onDragStart={(event) => onRowDragStartPrefix(event, prefixKey)}
						onDragEnd={clearDndHover}
						data-objects-row="true"
						data-testid={`objects-prefix-drop-target-${encodeURIComponent(prefixKey)}`}
						role="button"
						tabIndex={0}
					>
						<div className={styles.gridCardTopRow}>
							<div className={styles.gridCardTopActions}>
								<Typography.Text type="secondary">Folder</Typography.Text>
							</div>
							<ObjectsMenuPopover
								menu={menu}
								align="end"
								open={buttonMenuOpen}
								onOpenChange={(open, info) => {
									if (open) openPrefixContextMenu(prefixKey, 'button')
									else closeContextMenu({ key: prefixKey, kind: 'prefix', source: 'button' }, info?.source === 'menu' ? 'menu_item' : 'button_menu')
								}}
							>
								{({ toggle }) => (
									<Button
										size="small"
										type="text"
										icon={<EllipsisOutlined />}
										aria-label="Prefix actions"
										aria-haspopup="menu"
										aria-expanded={buttonMenuOpen}
										title="Prefix actions"
										onClick={(event) => {
											event.stopPropagation()
											toggle()
										}}
									/>
								)}
							</ObjectsMenuPopover>
						</div>
						<div className={`${styles.gridCardMedia} ${styles.gridCardMediaFolder}`}>
							<FolderOutlined className={styles.gridCardFolderIcon} />
						</div>
						<div className={styles.gridCardBody}>
							<Typography.Text className={styles.gridCardTitle} title={prefixKey}>
								{highlightText(displayName)}
							</Typography.Text>
							<Typography.Text type="secondary" className={styles.gridCardMetaLine}>
								Open folder
							</Typography.Text>
						</div>
					</div>
				</div>
			)
		},
		[
			canDragDrop,
			clearDndHover,
			closeContextMenu,
			contextMenuState.key,
			contextMenuState.kind,
			contextMenuState.open,
			contextMenuState.source,
			dndHoverPrefix,
			getPrefixActions,
			highlightText,
			isAdvanced,
			normalizeDropTargetPrefix,
			onDndTargetDragLeave,
			onDndTargetDragOver,
			onDndTargetDrop,
			onOpenPrefix,
			onRowDragStartPrefix,
			openPrefixContextMenu,
			prefix,
			recordContextMenuPoint,
			withContextMenuClassName,
		],
	)
}
