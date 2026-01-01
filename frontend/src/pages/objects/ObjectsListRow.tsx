import type { MenuProps } from 'antd'
import { Button, Checkbox, Dropdown, Tooltip, Typography } from 'antd'
import { EllipsisOutlined, FolderOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import type { DragEvent, MouseEvent, ReactNode } from 'react'

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
	contextMenuOpen: boolean
	buttonMenuOpen: boolean
	contextMenuPlacement?: 'bottomLeft' | 'topLeft'
	getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement
	onContextMenuOpenChange: (open: boolean) => void
	onButtonMenuOpenChange: (open: boolean) => void
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
	contextMenuOpen: boolean
	buttonMenuOpen: boolean
	contextMenuPlacement?: 'bottomLeft' | 'topLeft'
	getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement
	onContextMenuOpenChange: (open: boolean) => void
	onButtonMenuOpenChange: (open: boolean) => void
	onClick: (e: MouseEvent) => void
	onContextMenu: (e: MouseEvent<HTMLDivElement>) => void
	onCheckboxClick: (e: MouseEvent) => void
	onDragStart: (e: DragEvent) => void
	onDragEnd: () => void
	onToggleFavorite: () => void
	thumbnail?: ReactNode
}

const rowBaseStyle = {
	position: 'absolute',
	top: 0,
	left: 0,
	width: '100%',
	padding: '6px 12px',
	borderBottom: '1px solid #f5f5f5',
} as const

function rowStyle(offset: number, background?: string, minHeight?: number) {
	return {
		...rowBaseStyle,
		transform: `translateY(${offset}px)`,
		background,
		minHeight,
	}
}

function renderRowMenu(
	menu: MenuProps,
	open: boolean,
	onOpenChange: (open: boolean) => void,
	getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement,
	label = 'Row actions',
) {
	return (
		<span
			style={{ display: 'inline-flex' }}
			onClickCapture={(e) => {
				e.stopPropagation()
				onOpenChange(!open)
			}}
		>
			<Dropdown
				trigger={['click']}
				menu={menu}
				open={open}
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
				/>
			</Dropdown>
		</span>
	)
}

export function ObjectsPrefixRow(props: ObjectsPrefixRowProps) {
	return (
		<div style={rowStyle(props.offset, undefined, props.rowMinHeight)}>
		<Dropdown
			trigger={['contextMenu']}
			menu={props.menu}
			open={props.contextMenuOpen}
			onOpenChange={props.onContextMenuOpenChange}
			placement={props.contextMenuPlacement ?? 'bottomLeft'}
			getPopupContainer={props.getPopupContainer}
			autoAdjustOverflow
		>
				<div
					onClick={props.onOpen}
					onContextMenuCapture={props.onContextMenu}
					draggable={props.canDragDrop}
					onDragStart={props.onDragStart}
					onDragEnd={props.onDragEnd}
					className={`${styles.listGridBase} ${props.listGridClassName}`}
					data-objects-row="true"
					role="listitem"
					style={{ cursor: props.canDragDrop ? 'grab' : 'pointer' }}
				>
					<div />
					<div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
						<FolderOutlined style={{ color: '#1677ff' }} />
						<Typography.Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
							{props.highlightText(props.displayName)}
						</Typography.Text>
					</div>
					{props.isCompact ? (
						<div style={{ justifySelf: 'end' }}>
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
							<div style={{ textAlign: 'right' }}>
								<Typography.Text type="secondary">-</Typography.Text>
							</div>
							<div>
								<Typography.Text type="secondary">-</Typography.Text>
							</div>
							<div style={{ justifySelf: 'end' }}>
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
			</Dropdown>
		</div>
	)
}

export function ObjectsObjectRow(props: ObjectsObjectRowProps) {
	const metaLabel = `${props.sizeLabel} · ${props.timeLabel}`
	return (
		<div style={rowStyle(props.offset, props.isSelected ? '#e6f4ff' : undefined, props.rowMinHeight)}>
		<Dropdown
			trigger={['contextMenu']}
			menu={props.menu}
			open={props.contextMenuOpen}
			onOpenChange={props.onContextMenuOpenChange}
			placement={props.contextMenuPlacement ?? 'bottomLeft'}
			getPopupContainer={props.getPopupContainer}
			autoAdjustOverflow
		>
				<div
					onClick={props.onClick}
					onContextMenuCapture={props.onContextMenu}
					draggable={props.canDragDrop}
					onDragStart={props.onDragStart}
					onDragEnd={props.onDragEnd}
					className={`${styles.listGridBase} ${props.listGridClassName}`}
					data-objects-row="true"
					role="listitem"
					style={{ cursor: props.canDragDrop ? 'grab' : 'pointer' }}
				>
					<div>
						<Checkbox checked={props.isSelected} onClick={props.onCheckboxClick} />
					</div>

					<div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
						<div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
							{props.thumbnail ? <div style={{ display: 'flex', alignItems: 'center' }}>{props.thumbnail}</div> : null}
							<Tooltip title={props.isFavorite ? 'Remove favorite' : 'Add favorite'}>
								<Button
									type="text"
									size="small"
									icon={props.isFavorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
									onClick={(e) => {
										e.stopPropagation()
										props.onToggleFavorite()
									}}
									disabled={props.favoriteDisabled}
									aria-label={props.isFavorite ? 'Remove favorite' : 'Add favorite'}
								/>
							</Tooltip>
							<Tooltip title={props.objectKey}>
								<Typography.Text
									style={{
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										display: 'block',
									}}
								>
									{props.highlightText(props.displayName)}
								</Typography.Text>
							</Tooltip>
						</div>
						{props.isCompact ? (
							<Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.2 }}>
								{metaLabel}
							</Typography.Text>
						) : null}
					</div>

					{props.isCompact ? null : (
						<div style={{ textAlign: 'right' }}>
							<Typography.Text type="secondary">{props.sizeLabel}</Typography.Text>
						</div>
					)}

					{props.isCompact ? null : (
						<div>
							<Typography.Text type="secondary">{props.timeLabel}</Typography.Text>
						</div>
					)}

					<div style={{ justifySelf: 'end' }}>
						{renderRowMenu(
							props.menu,
							props.buttonMenuOpen,
							props.onButtonMenuOpenChange,
							props.getPopupContainer,
							'Object actions',
						)}
					</div>
				</div>
			</Dropdown>
		</div>
	)
}
