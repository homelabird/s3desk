import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode, Ref, UIEvent, WheelEvent } from 'react'
import type { MenuProps } from 'antd'

import styles from './objects.module.css'
import { ObjectsListSection } from './ObjectsListSection'

type ObjectsListSectionContainerProps = {
	controls: ReactNode
	alerts?: ReactNode
	selectionBar: ReactNode
	listHeader: ReactNode
	listContent: ReactNode
	listScrollerRef: Ref<HTMLDivElement>
	listScrollerTabIndex?: number
	onListScrollerClick?: (e: MouseEvent<HTMLDivElement>) => void
	onListScrollerKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
	onListScrollerScroll?: (e: UIEvent<HTMLDivElement>) => void
	onListScrollerWheel?: (e: WheelEvent<HTMLDivElement>) => void
	onListScrollerContextMenu?: (e: MouseEvent<HTMLDivElement>) => void
	listContextMenu?: MenuProps
	listContextMenuOpen?: boolean
	listContextMenuPlacement?: 'bottomLeft' | 'topLeft'
	onListContextMenuOpenChange?: (open: boolean) => void
	listContextMenuPopupContainer?: (triggerNode: HTMLElement) => HTMLElement
	uploadDropActive: boolean
	uploadDropLabel: string
	onUploadDragEnter: (e: DragEvent) => void
	onUploadDragLeave: (e: DragEvent) => void
	onUploadDragOver: (e: DragEvent) => void
	onUploadDrop: (e: DragEvent) => void
}

export function ObjectsListSectionContainer(props: ObjectsListSectionContainerProps) {
	return (
		<div className={`${styles.layoutPane} ${styles.layoutListPane}`}>
			<ObjectsListSection
				controls={props.controls}
				alerts={props.alerts}
				selectionBar={props.selectionBar}
				listHeader={props.listHeader}
				listContent={props.listContent}
				listScrollerRef={props.listScrollerRef}
				listScrollerTabIndex={props.listScrollerTabIndex}
				onListScrollerClick={props.onListScrollerClick}
				onListScrollerKeyDown={props.onListScrollerKeyDown}
				onListScrollerScroll={props.onListScrollerScroll}
				onListScrollerWheel={props.onListScrollerWheel}
				onListScrollerContextMenu={props.onListScrollerContextMenu}
				listContextMenu={props.listContextMenu}
				listContextMenuOpen={props.listContextMenuOpen}
				listContextMenuPlacement={props.listContextMenuPlacement}
				onListContextMenuOpenChange={props.onListContextMenuOpenChange}
				listContextMenuPopupContainer={props.listContextMenuPopupContainer}
				uploadDropActive={props.uploadDropActive}
				uploadDropLabel={props.uploadDropLabel}
				onUploadDragEnter={props.onUploadDragEnter}
				onUploadDragLeave={props.onUploadDragLeave}
				onUploadDragOver={props.onUploadDragOver}
				onUploadDrop={props.onUploadDrop}
			/>
		</div>
	)
}
