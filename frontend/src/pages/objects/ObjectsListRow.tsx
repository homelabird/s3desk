import type { MenuProps } from 'antd'
import { Button, Checkbox, Typography } from 'antd'
import { EllipsisOutlined, FolderOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react'

import styles from './objects.module.css'
import { ObjectsMenuPopover } from './ObjectsMenuPopover'
import type { PopoverOpenSource } from '../../components/PopoverSurface'

type BaseRowProps = {
	offset: number
	listGridClassName: string
	isCompact: boolean
	canDragDrop: boolean
	rowMinHeight: number
}

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

type ObjectsObjectRowProps = BaseRowProps & {
	objectKey: string
	displayName: string
	sizeLabel: string
	timeLabel: string
	isSelected: boolean
	isFavorite: boolean
	favoriteDisabled?: boolean
	highlightText: (value: string) => ReactNode
	menu: MenuProps
	buttonMenuOpen: boolean
	onButtonMenuOpenChange: (open: boolean, info?: { source: PopoverOpenSource }) => void
	onClick: (e: MouseEvent) => void
	onContextMenu: (e: MouseEvent<HTMLDivElement>) => void
	onCheckboxClick: (e: MouseEvent) => void
	onDragStart: (e: DragEvent) => void
	onDragEnd: () => void
	onToggleFavorite: () => void
	thumbnail?: ReactNode
}

function rowStyle(offset: number, minHeight?: number) {
	return {
		'--objects-row-offset': `${offset}px`,
		'--objects-row-min-height': typeof minHeight === 'number' ? `${minHeight}px` : undefined,
	} as CSSProperties
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
	return values.filter(Boolean).join(' ')
}

function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, onActivate: (event: KeyboardEvent<HTMLDivElement>) => void) {
	if (event.key !== 'Enter' && event.key !== ' ') return
	event.preventDefault()
	onActivate(event)
}

function renderRowMenu(
	menu: MenuProps,
	open: boolean,
	onOpenChange: (open: boolean, info?: { source: PopoverOpenSource }) => void,
	label = 'Row actions',
) {
	return (
		<ObjectsMenuPopover
			menu={menu}
			align="end"
			open={open}
			onOpenChange={onOpenChange}
			className={styles.listRowMenuRoot}
			menuClassName={styles.listRowMenuPopover}
		>
			{({ toggle }) => (
				<Button
					size="small"
					type="text"
					icon={<EllipsisOutlined />}
					aria-label={label}
					aria-haspopup="menu"
					aria-expanded={open}
					title={label}
					onClick={(event) => {
						event.stopPropagation()
						toggle()
					}}
				/>
			)}
		</ObjectsMenuPopover>
	)
}

export function ObjectsPrefixRow(props: ObjectsPrefixRowProps) {
	const outerClassName = joinClassNames(styles.listRowShell)
	const innerClassName = joinClassNames(
		styles.listRowInteractive,
		props.canDragDrop ? styles.listRowDraggable : styles.listRowClickable,
		styles.listGridBase,
		props.listGridClassName,
		styles.listRowDropTarget,
		props.isDropTargetActive && styles.listRowDropActive,
	)

	return (
		<div style={rowStyle(props.offset, props.rowMinHeight)} className={outerClassName} role="listitem">
			<div
				onClick={props.onOpen}
				onContextMenu={props.onContextMenu}
				onKeyDown={(event) => handleRowKeyDown(event, () => props.onOpen())}
				draggable={props.canDragDrop}
				onDragStart={props.onDragStart}
				onDragEnd={props.onDragEnd}
				onDragOver={props.onDropTargetDragOver}
				onDragLeave={props.onDropTargetDragLeave}
				onDrop={props.onDropTargetDrop}
				className={innerClassName}
				data-objects-row="true"
				data-testid={`objects-prefix-drop-target-${encodeURIComponent(props.prefixKey)}`}
				role="button"
				tabIndex={0}
			>
				<div />
				<div className={styles.listRowNameCell}>
					<FolderOutlined className={styles.listRowPrefixIcon} />
					<Typography.Text className={styles.listRowTextEllipsis}>{props.highlightText(props.displayName)}</Typography.Text>
				</div>
				{props.isCompact ? (
					<div className={styles.listRowMenuCell}>
						{renderRowMenu(props.menu, props.buttonMenuOpen, props.onButtonMenuOpenChange, 'Prefix actions')}
					</div>
				) : (
					<>
						<div className={styles.listRowMetricCellRight}>
							<Typography.Text type="secondary">-</Typography.Text>
						</div>
						<div>
							<Typography.Text type="secondary">-</Typography.Text>
						</div>
						<div className={styles.listRowMenuCell}>
							{renderRowMenu(props.menu, props.buttonMenuOpen, props.onButtonMenuOpenChange, 'Prefix actions')}
						</div>
					</>
				)}
			</div>
		</div>
	)
}

export function ObjectsObjectRow(props: ObjectsObjectRowProps) {
	const metaLabel = `${props.sizeLabel} · ${props.timeLabel}`
	const outerClassName = joinClassNames(styles.listRowShell, props.isSelected && styles.listRowSelected)
	const innerClassName = joinClassNames(
		styles.listRowInteractive,
		props.canDragDrop ? styles.listRowDraggable : styles.listRowClickable,
		styles.listGridBase,
		props.listGridClassName,
	)
	const favoriteLabel = props.isFavorite ? 'Remove favorite' : 'Add favorite'

	return (
		<div style={rowStyle(props.offset, props.rowMinHeight)} className={outerClassName} role="listitem">
			<div
				onClick={props.onClick}
				onContextMenu={props.onContextMenu}
				onKeyDown={(event) => handleRowKeyDown(event, (ev) => props.onClick(ev as unknown as MouseEvent))}
				draggable={props.canDragDrop}
				onDragStart={props.onDragStart}
				onDragEnd={props.onDragEnd}
				className={innerClassName}
				data-objects-row="true"
				role="button"
				tabIndex={0}
			>
				<div>
					<Checkbox checked={props.isSelected} onClick={props.onCheckboxClick} aria-label={`Select ${props.displayName}`} />
				</div>

				<div className={styles.listRowObjectMain}>
					<div className={styles.listRowNameCell}>
						{props.thumbnail ? <div className={styles.listRowThumbnailWrap}>{props.thumbnail}</div> : null}
						<Button
							type="text"
							size="small"
							icon={props.isFavorite ? <StarFilled className={styles.listRowFavoriteIcon} /> : <StarOutlined />}
							onClick={(event) => {
								event.stopPropagation()
								props.onToggleFavorite()
							}}
							disabled={props.favoriteDisabled}
							aria-label={favoriteLabel}
							title={favoriteLabel}
						/>
						<Typography.Text className={styles.listRowTextEllipsis} title={props.objectKey}>
							{props.highlightText(props.displayName)}
						</Typography.Text>
					</div>
					{props.isCompact ? (
						<Typography.Text type="secondary" className={styles.listRowMetaCompact}>
							{metaLabel}
						</Typography.Text>
					) : null}
				</div>

				{props.isCompact ? null : (
					<div className={styles.listRowMetricCellRight}>
						<Typography.Text type="secondary">{props.sizeLabel}</Typography.Text>
					</div>
				)}

				{props.isCompact ? null : (
					<div>
						<Typography.Text type="secondary">{props.timeLabel}</Typography.Text>
					</div>
				)}

				<div className={styles.listRowMenuCell}>
					{renderRowMenu(props.menu, props.buttonMenuOpen, props.onButtonMenuOpenChange, 'Object actions')}
				</div>
			</div>
		</div>
	)
}
