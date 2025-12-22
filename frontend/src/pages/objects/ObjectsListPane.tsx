import { forwardRef } from 'react'
import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react'

import styles from './objects.module.css'

export function ObjectsListPane(props: { children: ReactNode }) {
	return <div className={styles.listPane}>{props.children}</div>
}

export function ObjectsListTop(props: { children: ReactNode }) {
	return <div className={styles.listTop}>{props.children}</div>
}

export function ObjectsDropZoneCard(props: {
	children: ReactNode
	onDragEnter: (e: DragEvent) => void
	onDragLeave: (e: DragEvent) => void
	onDragOver: (e: DragEvent) => void
	onDrop: (e: DragEvent) => void
}) {
	return (
		<div
			onDragEnter={props.onDragEnter}
			onDragLeave={props.onDragLeave}
			onDragOver={props.onDragOver}
			onDrop={props.onDrop}
			className={styles.dropZoneCard}
		>
			{props.children}
		</div>
	)
}

export function ObjectsSelectionBar(props: { children: ReactNode }) {
	return <div className={styles.selectionBar}>{props.children}</div>
}

export function ObjectsListHeaderRow(props: { children: ReactNode }) {
	return <div className={styles.listHeaderRow}>{props.children}</div>
}

export type ObjectsListScrollerProps = {
	children: ReactNode
	onClick?: (e: MouseEvent<HTMLDivElement>) => void
	onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
	tabIndex?: number
}

export const ObjectsListScroller = forwardRef<HTMLDivElement, ObjectsListScrollerProps>(function ObjectsListScroller(
	{ children, onClick, onKeyDown, tabIndex },
	ref,
) {
	return (
		<div ref={ref} tabIndex={tabIndex} onClick={onClick} onKeyDown={onKeyDown} className={styles.listScroller}>
			{children}
		</div>
	)
})
