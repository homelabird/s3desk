import { ArrowUpOutlined, FolderOutlined } from '@ant-design/icons'
import { Typography } from 'antd'
import type { MenuProps } from 'antd'
import type { DragEvent, MouseEvent, ReactNode } from 'react'

import type { PopoverOpenSource } from '../../components/PopoverSurface'
import styles from './ObjectsListView.module.css'
import {
	joinClassNames,
	renderRowMenu,
	rowStyle,
	type BaseRowProps,
} from './ObjectsListRowPrimitives'

type ObjectsPrefixRowProps = BaseRowProps & {
	prefixKey: string
	displayName: string
	highlightText: (value: string) => ReactNode
	menu: MenuProps
	buttonMenuOpen: boolean
	onButtonMenuOpenChange: (open: boolean, info?: { source: PopoverOpenSource }) => void
	onContextMenu: (e: MouseEvent<HTMLDivElement>) => void
	onOpen: () => void
	onDragStart: (e: DragEvent) => void
	onDragEnd: () => void
	isDropTargetActive?: boolean
	onDropTargetDragOver?: (e: DragEvent<HTMLDivElement>) => void
	onDropTargetDragLeave?: (e: DragEvent<HTMLDivElement>) => void
	onDropTargetDrop?: (e: DragEvent<HTMLDivElement>) => void
}

type ObjectsParentRowProps = Omit<BaseRowProps, 'canDragDrop'> & {
	onOpen: () => void
}

export function ObjectsParentRow({
	offset,
	listGridClassName,
	isCompact,
	rowMinHeight,
	virtualRowIndex,
	measureElement,
	onOpen,
}: ObjectsParentRowProps) {
	return (
		<div
			ref={measureElement}
			data-index={virtualRowIndex}
			style={rowStyle(offset, rowMinHeight)}
			className={styles.listRowShell}
			role="listitem"
		>
			<div
				className={joinClassNames(styles.listRowInteractive, styles.listRowClickable, styles.listGridBase, listGridClassName)}
				data-objects-row="true"
				data-testid="objects-parent-row"
				onClick={onOpen}
			>
				<div />
				<div className={styles.listRowNameCell}>
					<button type="button" className={styles.listRowBodyButton} aria-label="Open parent folder">
						<span className={styles.listRowFolderIconWrap} aria-hidden="true">
							<ArrowUpOutlined className={styles.listRowPrefixIcon} />
						</span>
						<Typography.Text className={`${styles.listRowTextEllipsis} ${styles.listRowParentLabel}`}>../</Typography.Text>
					</button>
				</div>
				{isCompact ? (
					<div />
				) : (
					<>
						<div />
						<div />
						<div />
					</>
				)}
			</div>
		</div>
	)
}

export function ObjectsPrefixRow({
	offset,
	listGridClassName,
	isCompact,
	canDragDrop,
	rowMinHeight,
	virtualRowIndex,
	measureElement,
	prefixKey,
	displayName,
	highlightText,
	menu,
	buttonMenuOpen,
	onButtonMenuOpenChange,
	onContextMenu,
	onOpen,
	onDragStart,
	onDragEnd,
	isDropTargetActive,
	onDropTargetDragOver,
	onDropTargetDragLeave,
	onDropTargetDrop,
}: ObjectsPrefixRowProps) {
	const outerClassName = joinClassNames(styles.listRowShell)
	const innerClassName = joinClassNames(
		styles.listRowInteractive,
		canDragDrop ? styles.listRowDraggable : styles.listRowClickable,
		styles.listGridBase,
		listGridClassName,
		styles.listRowDropTarget,
		isDropTargetActive && styles.listRowDropActive,
	)

	return (
		<div
			ref={measureElement}
			data-index={virtualRowIndex}
			style={rowStyle(offset, rowMinHeight)}
			className={outerClassName}
			role="listitem"
		>
			<div
				onClick={onOpen}
				onContextMenu={onContextMenu}
				draggable={canDragDrop}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onDragOver={onDropTargetDragOver}
				onDragLeave={onDropTargetDragLeave}
				onDrop={onDropTargetDrop}
				className={innerClassName}
				data-objects-row="true"
				data-testid={`objects-prefix-drop-target-${encodeURIComponent(prefixKey)}`}
			>
				<div />
				<div className={styles.listRowNameCell}>
					<button type="button" className={styles.listRowBodyButton} aria-label={`Open prefix ${displayName}`}>
						<span className={styles.listRowFolderIconWrap} aria-hidden="true">
							<FolderOutlined className={styles.listRowPrefixIcon} />
						</span>
						<Typography.Text className={styles.listRowTextEllipsis}>{highlightText(displayName)}</Typography.Text>
					</button>
				</div>
				{isCompact ? (
					<div className={styles.listRowMenuCell}>
						{renderRowMenu(
							menu,
							buttonMenuOpen,
							onButtonMenuOpenChange,
							`Prefix actions for ${displayName}`,
							isCompact ? styles.listRowIconButton : undefined,
						)}
					</div>
				) : (
					<>
						<div className={styles.listRowMetricCellRight}>
							<Typography.Text type="secondary">-</Typography.Text>
						</div>
						<div>
							<Typography.Text type="secondary">-</Typography.Text>
						</div>
						<div className={styles.listRowActionsCell}>
							<div className={styles.listRowMenuCell}>
								{renderRowMenu(menu, buttonMenuOpen, onButtonMenuOpenChange, `Prefix actions for ${displayName}`)}
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	)
}
