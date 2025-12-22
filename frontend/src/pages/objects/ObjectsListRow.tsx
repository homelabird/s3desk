import type { MenuProps } from 'antd'
import { Button, Checkbox, Dropdown, Tooltip, Typography } from 'antd'
import { EllipsisOutlined, FolderOutlined } from '@ant-design/icons'
import type { DragEvent, MouseEvent, ReactNode } from 'react'

import styles from './objects.module.css'

type BaseRowProps = {
	offset: number
	listGridClassName: string
	isCompact: boolean
	canDragDrop: boolean
}

type ObjectsPrefixRowProps = BaseRowProps & {
	displayName: string
	highlightText: (value: string) => ReactNode
	menu: MenuProps
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
	highlightText: (value: string) => ReactNode
	menu: MenuProps
	onClick: (e: MouseEvent) => void
	onContextMenu: () => void
	onCheckboxClick: (e: MouseEvent) => void
	onDragStart: (e: DragEvent) => void
	onDragEnd: () => void
}

const rowBaseStyle = {
	position: 'absolute',
	top: 0,
	left: 0,
	width: '100%',
	padding: '6px 12px',
	borderBottom: '1px solid #f5f5f5',
} as const

function rowStyle(offset: number, background?: string) {
	return {
		...rowBaseStyle,
		transform: `translateY(${offset}px)`,
		background,
	}
}

function renderRowMenu(menu: MenuProps) {
	return (
		<Dropdown trigger={['click']} menu={menu}>
			<Button size="small" type="text" icon={<EllipsisOutlined />} onClick={(e) => e.stopPropagation()} />
		</Dropdown>
	)
}

export function ObjectsPrefixRow(props: ObjectsPrefixRowProps) {
	return (
		<div style={rowStyle(props.offset)}>
			<Dropdown trigger={['contextMenu']} menu={props.menu}>
				<div
					onClick={props.onOpen}
					draggable={props.canDragDrop}
					onDragStart={props.onDragStart}
					onDragEnd={props.onDragEnd}
					className={`${styles.listGridBase} ${props.listGridClassName}`}
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
						<div style={{ justifySelf: 'end' }} onClick={(e) => e.stopPropagation()}>
							{renderRowMenu(props.menu)}
						</div>
					) : (
						<>
							<div style={{ textAlign: 'right' }}>
								<Typography.Text type="secondary">-</Typography.Text>
							</div>
							<div>
								<Typography.Text type="secondary">-</Typography.Text>
							</div>
							<div style={{ justifySelf: 'end' }} onClick={(e) => e.stopPropagation()}>
								{renderRowMenu(props.menu)}
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
		<div style={rowStyle(props.offset, props.isSelected ? '#e6f4ff' : undefined)}>
			<Dropdown trigger={['contextMenu']} menu={props.menu}>
				<div
					onClick={props.onClick}
					onContextMenu={props.onContextMenu}
					draggable={props.canDragDrop}
					onDragStart={props.onDragStart}
					onDragEnd={props.onDragEnd}
					className={`${styles.listGridBase} ${props.listGridClassName}`}
					style={{ cursor: props.canDragDrop ? 'grab' : 'pointer' }}
				>
					<div>
						<Checkbox checked={props.isSelected} onClick={props.onCheckboxClick} />
					</div>

					<div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
						<div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
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

					<div style={{ justifySelf: 'end' }}>{renderRowMenu(props.menu)}</div>
				</div>
			</Dropdown>
		</div>
	)
}
