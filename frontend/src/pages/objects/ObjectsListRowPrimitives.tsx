import { MoreOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { MenuProps } from 'antd'
import type { CSSProperties } from 'react'

import type { PopoverOpenSource } from '../../components/PopoverSurface'
import { ObjectsMenuPopover } from './ObjectsMenuPopover'
import styles from './ObjectsListView.module.css'

export type MeasureElementRef = (element: HTMLDivElement | null) => void

export type BaseRowProps = {
	offset: number
	listGridClassName: string
	isCompact: boolean
	canDragDrop: boolean
	rowMinHeight: number
	virtualRowIndex?: number
	measureElement?: MeasureElementRef
}

export function rowStyle(offset: number, minHeight?: number) {
	return {
		'--objects-row-offset': `${offset}px`,
		'--objects-row-min-height': typeof minHeight === 'number' ? `${minHeight}px` : undefined,
	} as CSSProperties
}

export function joinClassNames(...values: Array<string | false | null | undefined>) {
	return values.filter(Boolean).join(' ')
}

export function renderRowMenu(
	menu: MenuProps,
	open: boolean,
	onOpenChange: (open: boolean, info?: { source: PopoverOpenSource }) => void,
	label = 'Row actions',
	buttonClassName?: string,
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
					className={joinClassNames(styles.listRowMenuButton, buttonClassName)}
					icon={<MoreOutlined />}
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
