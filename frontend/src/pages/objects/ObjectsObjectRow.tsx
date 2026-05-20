import { StarFilled, StarOutlined } from '@ant-design/icons'
import { Button, Checkbox, Typography } from 'antd'
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
	previewAction?: ReactNode
}

export function ObjectsObjectRow({
	offset,
	listGridClassName,
	isCompact,
	canDragDrop,
	rowMinHeight,
	virtualRowIndex,
	measureElement,
	objectKey,
	displayName,
	sizeLabel,
	timeLabel,
	isSelected,
	isFavorite,
	favoriteDisabled,
	highlightText,
	menu,
	buttonMenuOpen,
	onButtonMenuOpenChange,
	onClick,
	onContextMenu,
	onCheckboxClick,
	onDragStart,
	onDragEnd,
	onToggleFavorite,
	thumbnail,
	previewAction,
}: ObjectsObjectRowProps) {
	const metaLabel = `${sizeLabel} · ${timeLabel}`
	const outerClassName = joinClassNames(styles.listRowShell, isSelected && styles.listRowSelected)
	const innerClassName = joinClassNames(
		styles.listRowInteractive,
		canDragDrop ? styles.listRowDraggable : styles.listRowClickable,
		styles.listGridBase,
		listGridClassName,
	)
	const favoriteLabel = isFavorite ? `Remove favorite for ${displayName}` : `Add favorite for ${displayName}`

	return (
		<div
			ref={measureElement}
			data-index={virtualRowIndex}
			style={rowStyle(offset, rowMinHeight)}
			className={outerClassName}
			role="listitem"
		>
			<div
				onClick={onClick}
				onContextMenu={onContextMenu}
				draggable={canDragDrop}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				className={innerClassName}
				data-objects-row="true"
			>
				<div className={styles.listRowCheckboxCell}>
					<Checkbox checked={isSelected} onClick={onCheckboxClick} aria-label={`Select ${displayName}`} />
				</div>

				<div className={styles.listRowObjectMain}>
					<div className={styles.listRowNameCell}>
						<Button
							type="text"
							size="small"
							className={isCompact ? styles.listRowIconButton : undefined}
							icon={isFavorite ? <StarFilled className={styles.listRowFavoriteIcon} /> : <StarOutlined />}
							onClick={(event) => {
								event.stopPropagation()
								onToggleFavorite()
							}}
							disabled={favoriteDisabled}
							aria-label={favoriteLabel}
							title={favoriteLabel}
						/>
						<button type="button" className={styles.listRowBodyButton} aria-label={`Select object ${displayName}`} aria-pressed={isSelected}>
							{thumbnail ? <span className={styles.listRowThumbnailWrap}>{thumbnail}</span> : null}
							<Typography.Text className={styles.listRowTextEllipsis} title={objectKey}>
								{highlightText(displayName)}
							</Typography.Text>
						</button>
					</div>
					{isCompact ? (
						<Typography.Text type="secondary" className={styles.listRowMetaCompact}>
							{metaLabel}
						</Typography.Text>
					) : null}
				</div>

				{isCompact ? null : (
					<div className={styles.listRowMetricCellRight}>
						<Typography.Text type="secondary">{sizeLabel}</Typography.Text>
					</div>
				)}

				{isCompact ? null : (
					<div>
						<Typography.Text type="secondary">{timeLabel}</Typography.Text>
					</div>
				)}

				<div className={styles.listRowActionsCell}>
					{previewAction ? <div className={styles.listRowAuxActions}>{previewAction}</div> : null}
					<div className={styles.listRowMenuCell}>
						{renderRowMenu(
							menu,
							buttonMenuOpen,
							onButtonMenuOpenChange,
							`Object actions for ${displayName}`,
							isCompact ? styles.listRowIconButton : undefined,
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
