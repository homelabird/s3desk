import {
	CloudUploadOutlined,
	DeleteOutlined,
	DownOutlined,
	DownloadOutlined,
	EllipsisOutlined,
	FolderAddOutlined,
	FolderOutlined,
	InfoCircleOutlined,
	LeftOutlined,
	RightOutlined,
	UpOutlined,
} from '@ant-design/icons'
import { Badge, Button, Space, type MenuProps } from 'antd'
import type { ReactNode } from 'react'

import { ObjectsBucketPicker } from './ObjectsBucketPicker'
import { ObjectsMenuPopover } from './ObjectsMenuPopover'
import type { UIAction } from './objectsActions'
import styles from './objects.module.css'

export type ObjectsToolbarProps = {
	isDesktop: boolean
	showLabels: boolean
	isAdvanced: boolean
	isOffline: boolean
	hasProfile: boolean
	bucket: string
	recentBuckets: string[]
	selectedCount: number
	bucketOptions: Array<{ label: string; value: string }>
	bucketsLoading: boolean
	onBucketChange: (value: string | null) => void
	onBucketDropdownVisibleChange?: (open: boolean) => void
	canGoBack: boolean
	canGoForward: boolean
	canGoUp: boolean
	onGoBack: () => void
	onGoForward: () => void
	onGoUp: () => void
	uploadMenu: MenuProps
	uploadEnabled: boolean
	uploadDisabledReason?: string | null
	onUploadFiles: () => void
	canCreateFolder: boolean
	createFolderTooltipText: string
	onNewFolder: () => void
	onRefresh: () => void
	isRefreshing: boolean
	topMoreMenu: MenuProps
	showPrimaryActions: boolean
	primaryDownloadAction?: UIAction
	primaryDeleteAction?: UIAction
	activeTransferCount: number
	onOpenTransfers: () => void
	dockTree: boolean
	dockDetails: boolean
	onOpenTree: () => void
	onOpenDetails: () => void
}

function renderHinted(content: ReactNode, hint: string) {
	return (
		<span className={styles.toolbarHintWrap} title={hint}>
			{content}
		</span>
	)
}

function buildMenuButtonLabel(label: string, showLabels: boolean) {
	return showLabels ? label : null
}

export function ObjectsToolbar(props: ObjectsToolbarProps) {
	const canUseBucket = props.hasProfile && !props.isOffline
	const canUpload = props.hasProfile && !!props.bucket && !props.isOffline && props.uploadEnabled
	const uploadTooltipText = !props.hasProfile
		? 'Select a profile first'
		: props.isOffline
			? 'Offline: check your network connection'
			: !props.bucket
				? 'Select a bucket first'
				: !props.uploadEnabled
					? props.uploadDisabledReason ?? 'Uploads are not supported by this provider'
					: 'Upload files or folders'
	const createFolderTooltipText = props.createFolderTooltipText
	const showSelectionPrimaryActions = props.showPrimaryActions && props.selectedCount > 0
	const downloadDisabledReason = !props.hasProfile
		? 'Select a profile first'
		: props.isOffline
			? 'Offline: check your network connection'
			: !props.bucket
				? 'Select a bucket first'
				: props.selectedCount === 0
					? 'Select objects to download'
					: 'Download to your browser'
	const deleteDisabledReason = !props.hasProfile
		? 'Select a profile first'
		: props.isOffline
			? 'Offline: check your network connection'
			: !props.bucket
				? 'Select a bucket first'
				: props.selectedCount === 0
					? 'Select objects to delete'
					: 'Delete selected objects'

	const renderPrimaryActionButton = (
		action: UIAction | undefined,
		opts: { icon: ReactNode; fallbackLabel: string; danger?: boolean; tooltip: string },
	) => {
		if (!action) return null
		const label = props.showLabels ? action.shortLabel ?? action.label ?? opts.fallbackLabel : null
		const disabled = !action.enabled
		const ariaLabel = action.label ?? opts.fallbackLabel
		const button = (
			<Button size="middle" icon={opts.icon} danger={opts.danger} disabled={disabled} onClick={action.run} aria-label={ariaLabel}>
				{label}
			</Button>
		)
		return renderHinted(button, disabled ? opts.tooltip : action.label ?? opts.fallbackLabel)
	}

	const uploadButtonDesktop = renderHinted(
		<ObjectsMenuPopover menu={props.uploadMenu}>
			{({ toggle }) => (
				<div className={styles.toolbarSplitButton}>
					<Button type="primary" icon={<CloudUploadOutlined />} disabled={!canUpload} onClick={props.onUploadFiles}>
						Upload
					</Button>
					<Button
						type="primary"
						icon={<DownOutlined />}
						disabled={!canUpload}
						onClick={toggle}
						aria-label="Upload actions"
						className={styles.toolbarSplitToggle}
					/>
				</div>
			)}
		</ObjectsMenuPopover>,
		uploadTooltipText,
	)

	const uploadButtonMobile = renderHinted(
		<ObjectsMenuPopover menu={props.uploadMenu}>
			{({ toggle }) => (
				<div className={styles.toolbarSplitButton}>
					<Button icon={<CloudUploadOutlined />} disabled={!canUpload} onClick={props.onUploadFiles} aria-label="Upload">
						{buildMenuButtonLabel('Upload', props.showLabels)}
					</Button>
					<Button
						icon={<DownOutlined />}
						disabled={!canUpload}
						onClick={toggle}
						aria-label="Upload actions"
						className={styles.toolbarSplitToggle}
					/>
				</div>
			)}
		</ObjectsMenuPopover>,
		uploadTooltipText,
	)

	const newFolderButton = renderHinted(
		<Button icon={<FolderAddOutlined />} disabled={!props.canCreateFolder} onClick={props.onNewFolder} aria-label="New folder">
			{props.showLabels ? 'New folder' : null}
		</Button>,
		props.canCreateFolder ? 'New folder (Ctrl+Shift+N)' : createFolderTooltipText,
	)

	const moreButton = (
		<ObjectsMenuPopover menu={props.topMoreMenu} align="end">
			{({ toggle }) => (
				<Badge count={props.activeTransferCount} size="small" showZero={false}>
					<Button icon={<EllipsisOutlined />} disabled={!props.hasProfile} onClick={toggle} data-testid="objects-toolbar-more" aria-label="More actions">
						{props.isDesktop ? 'More' : buildMenuButtonLabel('Actions', props.showLabels)}
					</Button>
				</Badge>
			)}
		</ObjectsMenuPopover>
	)

	const bucketPicker = (
		<ObjectsBucketPicker
			isDesktop={props.isDesktop}
			value={props.bucket}
			recentBuckets={props.recentBuckets}
			options={props.bucketOptions}
			placeholder={props.bucketsLoading && props.bucketOptions.length === 0 ? 'Loading buckets…' : 'Bucket…'}
			disabled={!canUseBucket || (props.bucketsLoading && props.bucketOptions.length === 0)}
			className={props.isDesktop ? styles.toolbarBucketDesktop : styles.toolbarBucketMobile}
			onChange={props.onBucketChange}
			onOpenChange={props.onBucketDropdownVisibleChange}
		/>
	)

	if (props.isDesktop) {
		return (
			<div className={styles.toolbarRow}>
				<Space wrap className={styles.toolbarGroup}>
					{props.isAdvanced ? (
						<>
							<Button
								icon={<LeftOutlined />}
								disabled={!props.hasProfile || props.isOffline || !props.canGoBack}
								onClick={props.onGoBack}
								aria-label="Go back"
								title="Back"
							/>
							<Button
								icon={<RightOutlined />}
								disabled={!props.hasProfile || props.isOffline || !props.canGoForward}
								onClick={props.onGoForward}
								aria-label="Go forward"
								title="Forward"
							/>
							<Button
								icon={<UpOutlined />}
								disabled={!props.hasProfile || props.isOffline || !props.canGoUp}
								onClick={props.onGoUp}
								aria-label="Go up"
								title="Up"
							/>
						</>
					) : null}
					{bucketPicker}
				</Space>

				<Space wrap className={`${styles.toolbarGroup} ${styles.toolbarGroupRight}`}>
					{uploadButtonDesktop}
					{newFolderButton}
					{showSelectionPrimaryActions ? (
						<>
							{renderPrimaryActionButton(props.primaryDownloadAction, {
								icon: <DownloadOutlined />,
								fallbackLabel: 'Download',
								tooltip: downloadDisabledReason,
							})}
							{renderPrimaryActionButton(props.primaryDeleteAction, {
								icon: <DeleteOutlined />,
								fallbackLabel: 'Delete',
								danger: true,
								tooltip: deleteDisabledReason,
							})}
						</>
					) : null}
					{moreButton}
				</Space>
			</div>
		)
	}

	return (
		<div className={styles.toolbarColumn}>
			<Space wrap className={styles.toolbarTopRow}>
				<Space wrap className={`${styles.toolbarGroup} ${styles.toolbarTopActions}`}>
					{props.isAdvanced ? (
						<>
							<Button
								icon={<LeftOutlined />}
								disabled={!props.hasProfile || props.isOffline || !props.canGoBack}
								onClick={props.onGoBack}
								aria-label="Go back"
								title="Back"
							/>
							<Button
								icon={<RightOutlined />}
								disabled={!props.hasProfile || props.isOffline || !props.canGoForward}
								onClick={props.onGoForward}
								aria-label="Go forward"
								title="Forward"
							/>
							<Button
								icon={<UpOutlined />}
								disabled={!props.hasProfile || props.isOffline || !props.canGoUp}
								onClick={props.onGoUp}
								aria-label="Go up"
							>
								Up
							</Button>
						</>
					) : null}
					{uploadButtonMobile}
					{newFolderButton}
					{showSelectionPrimaryActions ? (
						<>
							{renderPrimaryActionButton(props.primaryDownloadAction, {
								icon: <DownloadOutlined />,
								fallbackLabel: 'Download',
								tooltip: downloadDisabledReason,
							})}
							{renderPrimaryActionButton(props.primaryDeleteAction, {
								icon: <DeleteOutlined />,
								fallbackLabel: 'Delete',
								danger: true,
								tooltip: deleteDisabledReason,
							})}
						</>
					) : null}
					{props.isAdvanced && !props.dockTree ? (
						<Button icon={<FolderOutlined />} onClick={props.onOpenTree} disabled={!props.hasProfile || props.isOffline} aria-label="Folders">
							{props.showLabels ? 'Folders' : null}
						</Button>
					) : null}
					{props.isAdvanced && !props.dockDetails ? (
						<Button icon={<InfoCircleOutlined />} onClick={props.onOpenDetails} disabled={!props.hasProfile || props.isOffline} aria-label="Details">
							{props.showLabels ? 'Details' : null}
						</Button>
					) : null}
				</Space>

				{moreButton}
			</Space>

			{bucketPicker}
		</div>
	)
}
