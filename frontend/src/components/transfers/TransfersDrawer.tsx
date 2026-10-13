import { Badge, Button, Empty, Space, Tag, Typography } from 'antd'
import { CloudUploadOutlined, DownloadOutlined } from '@ant-design/icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useLayoutEffect, useMemo, useRef, type MouseEvent, type ReactNode } from 'react'

import { AppTabs } from '../AppTabs'
import { OverlaySheet } from '../OverlaySheet'
import { isTransferFinished, type DownloadTask, type TransfersTab, type UploadTask } from './transferTypes'
import { TransferDownloadRow } from './TransferDownloadRow'
import { TransferUploadRow } from './TransferUploadRow'

export type TransfersDrawerProps = {
	open: boolean
	onClose: () => void
	tab: TransfersTab
	onTabChange: (tab: TransfersTab) => void
	activeDownloadCount: number
	activeUploadCount: number
	activeTransferCount: number
	downloadTasks: DownloadTask[]
	uploadTasks: UploadTask[]
	downloadSummaryText: string
	uploadSummaryText: string
	hasCompletedDownloads: boolean
	hasCompletedUploads: boolean
	onClearCompletedDownloads: () => void
	onClearCompletedUploads: () => void
	onClearFinished: () => void
	onCancelDownload: (taskId: string) => void
	onRetryDownload: (taskId: string) => void
	onHandOffDownload?: (taskId: string) => void
	onRemoveDownload: (taskId: string) => void
	onCancelUpload: (taskId: string) => void
	onRetryUpload: (taskId: string) => void
	onRemoveUpload: (taskId: string) => void
	onOpenJobs: (profileId: string, jobId: string) => void
}

function TransferVirtualList<T extends { id: string }>(props: {
	items: T[]
	ariaLabel: string
	renderItem: (item: T) => ReactNode
}) {
	const scrollRef = useRef<HTMLDivElement | null>(null)
	const virtualizer = useVirtualizer({
		count: props.items.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 190,
		overscan: 3,
	})
	const measuredItems = virtualizer.getVirtualItems()
	const virtualItems = useMemo(
		() =>
			measuredItems.length > 0
				? measuredItems
				: props.items.slice(0, 12).map((_, index) => ({
						index,
						key: index,
						start: index * 190,
						size: 190,
						end: (index + 1) * 190,
						lane: 0,
					})),
		[measuredItems, props.items],
	)
	const totalSize = measuredItems.length > 0 ? virtualizer.getTotalSize() : props.items.length * 190

	return (
		<div
			ref={scrollRef}
			role="list"
			aria-label={props.ariaLabel}
			style={{ position: 'relative', height: 280, overflowY: 'auto' }}
		>
			<div style={{ position: 'relative', height: totalSize }}>
				{virtualItems.map((virtualItem) => {
					const item = props.items[virtualItem.index]
					if (!item) return null
					return (
						<div
							key={item.id}
							ref={virtualizer.measureElement}
							data-index={virtualItem.index}
							style={{
								position: 'absolute',
								top: 0,
								left: 0,
								width: '100%',
								paddingBottom: 12,
								transform: `translateY(${virtualItem.start}px)`,
							}}
						>
							{props.renderItem(item)}
						</div>
					)
				})}
			</div>
		</div>
	)
}

export function TransfersDrawer(props: TransfersDrawerProps) {
	const { onRemoveDownload: removeDownloadTask, onRemoveUpload: removeUploadTask } = props
	const hasClearableTransfers = [...props.downloadTasks, ...props.uploadTasks].some((task) => isTransferFinished(task.status))
	const hasCompletedTransfers = props.tab === 'downloads' ? props.hasCompletedDownloads : props.hasCompletedUploads
	const removalFocusRef = useRef<{
		tab: TransfersTab
		taskId: string
		owner: HTMLElement
		dialog: HTMLElement
		targets: (HTMLElement | null | undefined)[]
	} | null>(null)
	const rememberRemovalFocus = useCallback((tab: TransfersTab, taskId: string, event?: MouseEvent<HTMLElement>) => {
		removalFocusRef.current = null
		const owner = event?.currentTarget
		if (!owner || event?.detail !== 0 || document.activeElement !== owner) return
		const list = owner.closest('[role="list"]')
		const dialog = owner.closest<HTMLElement>('[role="dialog"]')
		if (!list || !dialog) return
		const removeActions = Array.from(list.querySelectorAll<HTMLElement>('button[aria-label^="Remove "]'))
		const index = removeActions.indexOf(owner)
		if (index < 0) return
		removalFocusRef.current = {
			tab, taskId, owner, dialog,
			targets: [removeActions[index + 1], removeActions[index - 1], dialog.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')],
		}
	}, [])
	const onRemoveDownload = useCallback((taskId: string, event?: MouseEvent<HTMLElement>) => {
		rememberRemovalFocus('downloads', taskId, event)
		removeDownloadTask(taskId)
	}, [rememberRemovalFocus, removeDownloadTask])
	const onRemoveUpload = useCallback((taskId: string, event?: MouseEvent<HTMLElement>) => {
		rememberRemovalFocus('uploads', taskId, event)
		removeUploadTask(taskId)
	}, [rememberRemovalFocus, removeUploadTask])

	useLayoutEffect(() => {
		const pending = removalFocusRef.current
		if (!pending) return
		const tasks = pending.tab === 'downloads' ? props.downloadTasks : props.uploadTasks
		if (tasks.some((task) => task.id === pending.taskId)) return
		removalFocusRef.current = null
		if (!props.open || props.tab !== pending.tab) return
		if (document.activeElement !== document.body && document.activeElement !== pending.owner) return
		const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
		if (dialogs[dialogs.length - 1] !== pending.dialog) return
		pending.targets.find((target) => target?.isConnected)?.focus()
	}, [props.open, props.tab, props.downloadTasks, props.uploadTasks])

	return (
		<OverlaySheet
			open={props.open}
			onClose={props.onClose}
			title={
				<Space size="small">
					<Typography.Text strong>Transfers</Typography.Text>
					{props.activeTransferCount > 0 ? <Tag color="processing">{props.activeTransferCount} active</Tag> : null}
				</Space>
			}
			placement="bottom"
			height={440}
			extra={
				hasCompletedTransfers || hasClearableTransfers ? (
					<Space>
						{hasCompletedTransfers ? (
							<Button
								size="small"
								onClick={props.tab === 'downloads' ? props.onClearCompletedDownloads : props.onClearCompletedUploads}
							>
								Clear done
							</Button>
						) : null}
						{hasClearableTransfers ? (
							<Button size="small" title="Clear completed, failed and canceled transfers from both queues" onClick={props.onClearFinished}>
								Clear all finished
							</Button>
						) : null}
					</Space>
				) : null
			}
		>
			<AppTabs
				ariaLabel="Transfer queues"
				size="small"
				activeKey={props.tab}
				onChange={(key) => props.onTabChange(key as TransfersTab)}
				items={[
					{
						key: 'downloads',
						label: (
							<Space size={8}>
								<Badge count={props.activeDownloadCount} size="small" showZero={false}>
									<DownloadOutlined />
								</Badge>
								Downloads
							</Space>
						),
						children: (
							<div style={{ paddingTop: 8 }}>
								{props.downloadTasks.length === 0 ? (
									<Empty description="No downloads yet" />
								) : (
									<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
										{props.downloadSummaryText ? (
											<Typography.Text type="secondary">{props.downloadSummaryText}</Typography.Text>
										) : null}
										<TransferVirtualList
											items={props.downloadTasks}
											ariaLabel="Download transfers"
											renderItem={(t) => (
												<TransferDownloadRow
													task={t}
													onCancel={props.onCancelDownload}
													onRetry={props.onRetryDownload}
													onHandOff={props.onHandOffDownload}
													onRemove={onRemoveDownload}
													onOpenJobs={props.onOpenJobs}
												/>
											)}
										/>
									</div>
								)}
							</div>
						),
					},
					{
						key: 'uploads',
						label: (
							<Space size={8}>
								<Badge count={props.activeUploadCount} size="small" showZero={false}>
									<CloudUploadOutlined />
								</Badge>
								Uploads
							</Space>
						),
						children: (
							<div style={{ paddingTop: 8 }}>
								{props.uploadTasks.length === 0 ? (
									<Empty
										description={
											<Space orientation="vertical" size={4} align="center">
												<span>No uploads yet</span>
												<Typography.Text type="secondary">
													Tip: drag & drop files into the object list to queue uploads.
												</Typography.Text>
											</Space>
										}
									/>
								) : (
									<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
										{props.uploadSummaryText ? (
											<Typography.Text type="secondary">{props.uploadSummaryText}</Typography.Text>
										) : null}
										<TransferVirtualList
											items={props.uploadTasks}
											ariaLabel="Upload transfers"
											renderItem={(t) => (
												<TransferUploadRow
													task={t}
													onOpenJobs={props.onOpenJobs}
													onCancel={props.onCancelUpload}
													onRetry={props.onRetryUpload}
													onRemove={onRemoveUpload}
												/>
											)}
										/>
									</div>
								)}
							</div>
						),
					},
				]}
			/>
		</OverlaySheet>
	)
}
