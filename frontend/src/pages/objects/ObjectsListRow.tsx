import type { MenuProps } from 'antd'
import { Button, Checkbox, Dropdown, Tooltip, Typography } from 'antd'
import { EllipsisOutlined, FolderOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react'

import styles from './objects.module.css'

type BaseRowProps = {
	offset: number
	listGridClassName: string
	isCompact: boolean
	canDragDrop: boolean
	rowMinHeight: number
}

type ObjectsPrefixRowProps = BaseRowProps & {
	displayName: string
	highlightText: (value: string) => ReactNode
	menu: MenuProps
	buttonMenuOpen: boolean
	getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement
	onButtonMenuOpenChange: (open: boolean, info?: { source: 'trigger' | 'menu' }) => void
	onContextMenu: (e: MouseEvent<HTMLDivElement>) => void
	onOpen: () => void
	onDragStart: (e: DragEvent) => void
	onDragEnd: () => void
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
	getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement
	onButtonMenuOpenChange: (open: boolean, info?: { source: 'trigger' | 'menu' }) => void
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
	onOpenChange: (open: boolean, info?: { source: 'trigger' | 'menu' }) => void,
	getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement,
	label = 'Row actions',
) {
	return (
		<Dropdown
			trigger={['click']}
			menu={menu}
			onOpenChange={onOpenChange}
			getPopupContainer={getPopupContainer}
			autoAdjustOverflow
		>
			<Button
				size="small"
				type="text"
				icon={<EllipsisOutlined />}
				aria-label={label}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={(e) => e.stopPropagation()}
			/>
		</Dropdown>
	)
}

export function ObjectsPrefixRow(props: ObjectsPrefixRowProps) {
	const outerClassName = joinClassNames(styles.listRowShell)
	const innerClassName = joinClassNames(
		styles.listRowInteractive,
		props.canDragDrop ? styles.listRowDraggable : styles.listRowClickable,
		styles.listGridBase,
		props.listGridClassName,
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
				className={innerClassName}
				data-objects-row="true"
				role="button"
				tabIndex={0}
			>
				<div />
				<div className={styles.listRowNameCell}>
					<FolderOutlined className={styles.listRowPrefixIcon} />
					<Typography.Text className={styles.listRowTextEllipsis}>
						{props.highlightText(props.displayName)}
					</Typography.Text>
				</div>
				{props.isCompact ? (
					<div className={styles.listRowMenuCell}>
						{renderRowMenu(
							props.menu,
							props.buttonMenuOpen,
							props.onButtonMenuOpenChange,
							props.getPopupContainer,
							'Prefix actions',
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
						<div className={styles.listRowMenuCell}>
							{renderRowMenu(
								props.menu,
								props.buttonMenuOpen,
								props.onButtonMenuOpenChange,
								props.getPopupContainer,
								'Prefix actions',
							)}
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
					<Checkbox
						checked={props.isSelected}
						onClick={props.onCheckboxClick}
						aria-label={`Select ${props.displayName}`}
					/>
				</div>

				<div className={styles.listRowObjectMain}>
					<div className={styles.listRowNameCell}>
						{props.thumbnail ? <div className={styles.listRowThumbnailWrap}>{props.thumbnail}</div> : null}
						<Tooltip title={props.isFavorite ? 'Remove favorite' : 'Add favorite'}>
							<Button
								type="text"
								size="small"
								icon={props.isFavorite ? <StarFilled className={styles.listRowFavoriteIcon} /> : <StarOutlined />}
								onClick={(e) => {
									e.stopPropagation()
									props.onToggleFavorite()
								}}
								disabled={props.favoriteDisabled}
								aria-label={props.isFavorite ? 'Remove favorite' : 'Add favorite'}
							/>
						</Tooltip>
						<Tooltip title={props.objectKey}>
							<Typography.Text className={styles.listRowTextEllipsis}>
								{props.highlightText(props.displayName)}
							</Typography.Text>
						</Tooltip>
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
					{renderRowMenu(
						props.menu,
						props.buttonMenuOpen,
						props.onButtonMenuOpenChange,
						props.getPopupContainer,
						'Object actions',
					)}
				</div>
			</div>
		</div>
	)
}
