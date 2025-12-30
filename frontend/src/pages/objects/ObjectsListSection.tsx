import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode, Ref, UIEvent, WheelEvent } from 'react'
import type { MenuProps } from 'antd'
import { Dropdown, Space, Typography } from 'antd'
import { CloudUploadOutlined } from '@ant-design/icons'

import { ObjectsDropZoneCard, ObjectsListPane, ObjectsListScroller, ObjectsListTop } from './ObjectsListPane'

type ObjectsListSectionProps = {
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

export function ObjectsListSection({
	controls,
	alerts,
	selectionBar,
	listHeader,
	listContent,
	listScrollerRef,
	listScrollerTabIndex,
	onListScrollerClick,
	onListScrollerKeyDown,
	onListScrollerScroll,
	onListScrollerWheel,
	onListScrollerContextMenu,
	listContextMenu,
	listContextMenuOpen,
	listContextMenuPlacement,
	onListContextMenuOpenChange,
	listContextMenuPopupContainer,
	uploadDropActive,
	uploadDropLabel,
	onUploadDragEnter,
	onUploadDragLeave,
	onUploadDragOver,
	onUploadDrop,
}: ObjectsListSectionProps) {
	return (
		<ObjectsListPane>
			<ObjectsListTop>
				{controls}
				{alerts}
				<ObjectsDropZoneCard
					onDragEnter={onUploadDragEnter}
					onDragLeave={onUploadDragLeave}
					onDragOver={onUploadDragOver}
					onDrop={onUploadDrop}
				>
					{uploadDropActive ? (
						<div
							style={{
								position: 'absolute',
								inset: 0,
								background: 'rgba(22, 119, 255, 0.06)',
								border: '2px dashed #1677ff',
								borderRadius: 8,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								zIndex: 10,
								pointerEvents: 'none',
							}}
						>
							<Space direction="vertical" align="center" size="small">
								<CloudUploadOutlined style={{ fontSize: 32, color: '#1677ff' }} />
								<Typography.Text>
									Drop to upload to <Typography.Text code>{uploadDropLabel}</Typography.Text>
								</Typography.Text>
								<Typography.Text type="secondary">
									Tip: drop a folder to preserve relative paths (browser support varies)
								</Typography.Text>
							</Space>
						</div>
					) : null}
					{selectionBar}
					{listHeader}
					{listContextMenu ? (
						<Dropdown
							trigger={['contextMenu']}
							menu={listContextMenu}
							open={listContextMenuOpen}
							onOpenChange={onListContextMenuOpenChange}
							placement={listContextMenuPlacement ?? 'bottomLeft'}
							getPopupContainer={listContextMenuPopupContainer}
							autoAdjustOverflow
						>
							<ObjectsListScroller
								ref={listScrollerRef}
								tabIndex={listScrollerTabIndex}
								onClick={onListScrollerClick}
								onKeyDown={onListScrollerKeyDown}
								onScroll={onListScrollerScroll}
								onWheel={onListScrollerWheel}
								onContextMenuCapture={onListScrollerContextMenu}
							>
								{listContent}
							</ObjectsListScroller>
						</Dropdown>
					) : (
						<ObjectsListScroller
							ref={listScrollerRef}
							tabIndex={listScrollerTabIndex}
							onClick={onListScrollerClick}
							onKeyDown={onListScrollerKeyDown}
							onScroll={onListScrollerScroll}
							onWheel={onListScrollerWheel}
							onContextMenuCapture={onListScrollerContextMenu}
						>
							{listContent}
						</ObjectsListScroller>
					)}
				</ObjectsDropZoneCard>
			</ObjectsListTop>
		</ObjectsListPane>
	)
}
