import {
	CloudUploadOutlined,
	DeleteOutlined,
	DownloadOutlined,
	EllipsisOutlined,
	FolderAddOutlined,
	InfoCircleOutlined,
	LeftOutlined,
	RightOutlined,
	UpOutlined,
} from '@ant-design/icons'
import { Badge, Button, Space, type MenuProps } from 'antd'
import type { ReactNode } from 'react'

import {
	bucketFieldPlaceholder,
	deleteSelectedObjectsLabel,
	downloadToBrowserHint,
	loadingBucketsPlaceholder,
	newFolderShortcutHint,
	offlineNetworkConnectionHint,
	selectBucketFirstHint,
	selectProfileFirstHint,
	uploadFilesOrFoldersHint,
	uploadsUnsupportedHint,
} from '../../lib/actionHints'
import { ObjectsBucketPicker } from './ObjectsBucketPicker'
import { ObjectsMenuPopover } from './ObjectsMenuPopover'
import type { UIAction } from './objectsActions'
import { OBJECTS_DETAILS_DRAWER_ID } from './objectsOverlayIds'
import styles from './ObjectsShell.module.css'

export type ObjectsToolbarProps = {
	isDesktop: boolean
	showLabels: boolean
	isAdvanced: boolean
	isOffline: boolean
	hasProfile: boolean
	bucketPickerScopeKey: string
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
	uploadEnabled: boolean
	uploadDisabledReason?: string | null
	onUpload: () => void
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
	treeDrawerOpen: boolean
	dockDetails: boolean
	detailsDrawerOpen: boolean
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

type DesktopToolbarLayoutProps = {
	bucketPicker: ReactNode
	navButtons: ReactNode
	primaryActions: ReactNode
	selectionActions: ReactNode
	utilityActions: ReactNode
}

function DesktopToolbarLayout(props: DesktopToolbarLayoutProps) {
	return (
		<div className={styles.toolbarDesktopStack} data-testid="objects-toolbar-desktop-stack">
			<div className={styles.toolbarDesktopPrimaryRow} data-testid="objects-toolbar-desktop-primary-row">
				<div className={`${styles.toolbarGroup} ${styles.toolbarDesktopNavGroup}`}>
					{props.bucketPicker}
					{props.navButtons}
				</div>
				<div className={`${styles.toolbarGroup} ${styles.toolbarDesktopPrimaryActions}`}>
					{props.selectionActions}
					{props.primaryActions}
					{props.utilityActions}
				</div>
			</div>
		</div>
	)
}

export function ObjectsToolbar(props: ObjectsToolbarProps) {
	const actionButtonSize = props.isDesktop && props.showLabels ? 'middle' : 'small'
	const canUseBucket = props.hasProfile && !props.isOffline
	const canUpload = props.hasProfile && !!props.bucket && !props.isOffline && props.uploadEnabled
	const uploadTooltipText = !props.hasProfile
		? selectProfileFirstHint()
		: props.isOffline
			? offlineNetworkConnectionHint()
			: !props.bucket
				? selectBucketFirstHint()
				: !props.uploadEnabled
					? props.uploadDisabledReason ?? uploadsUnsupportedHint()
					: uploadFilesOrFoldersHint()
	const createFolderTooltipText = props.createFolderTooltipText
	const showSelectionPrimaryActions = props.showPrimaryActions && props.selectedCount > 0
	const downloadDisabledReason = !props.hasProfile
		? selectProfileFirstHint()
		: props.isOffline
			? offlineNetworkConnectionHint()
			: !props.bucket
				? selectBucketFirstHint()
				: downloadToBrowserHint()
	const deleteDisabledReason = !props.hasProfile
		? selectProfileFirstHint()
		: props.isOffline
			? offlineNetworkConnectionHint()
			: !props.bucket
				? selectBucketFirstHint()
				: deleteSelectedObjectsLabel()

	const renderPrimaryActionButton = (
		action: UIAction | undefined,
		opts: { icon: ReactNode; fallbackLabel: string; danger?: boolean; tooltip: string },
	) => {
		if (!action) return null
		const label = props.showLabels ? action.shortLabel ?? action.label ?? opts.fallbackLabel : null
		const disabled = !action.enabled
		const ariaLabel = action.label ?? opts.fallbackLabel
		const button = (
			<Button size={actionButtonSize} icon={opts.icon} danger={opts.danger} disabled={disabled} onClick={action.run} aria-label={ariaLabel}>
				{label}
			</Button>
		)
		return renderHinted(button, disabled ? opts.tooltip : action.label ?? opts.fallbackLabel)
	}

	const uploadButtonDesktop = renderHinted(
		<Button type="primary" size={actionButtonSize} icon={<CloudUploadOutlined />} disabled={!canUpload} onClick={props.onUpload} aria-label="Upload">
			{buildMenuButtonLabel('Upload…', props.showLabels)}
		</Button>,
		uploadTooltipText,
	)

	const uploadButtonMobile = renderHinted(
		<Button size="small" icon={<CloudUploadOutlined />} disabled={!canUpload} onClick={props.onUpload} aria-label="Upload">
			{buildMenuButtonLabel('Upload…', props.showLabels)}
		</Button>,
		uploadTooltipText,
	)

	const newFolderButton = renderHinted(
		<Button size={actionButtonSize} icon={<FolderAddOutlined />} disabled={!props.canCreateFolder} onClick={props.onNewFolder} aria-label="New folder">
			{props.showLabels ? 'New folder' : null}
		</Button>,
		props.canCreateFolder ? newFolderShortcutHint() : createFolderTooltipText,
	)
	const showMobileBack = props.isAdvanced && props.hasProfile && !props.isOffline && props.canGoBack
	const showMobileForward = props.isAdvanced && props.hasProfile && !props.isOffline && props.canGoForward
	const showMobileUp = props.isAdvanced && props.hasProfile && !props.isOffline && props.canGoUp
	const showMobileDetails = props.isAdvanced && !props.dockDetails && props.selectedCount > 0
	const moreButtonAriaLabel = props.isDesktop ? 'Object tools' : 'More actions'
	const moreButtonText = props.isDesktop ? 'Tools' : 'More'
	const navButtonSize = 'small'

	const moreButton = (
		<ObjectsMenuPopover menu={props.topMoreMenu} align="end" scopeKey={props.bucketPickerScopeKey}>
			{({ toggle, open }) => (
				<Badge count={props.activeTransferCount} size="small" showZero={false}>
					<Button
						size={actionButtonSize}
						icon={<EllipsisOutlined />}
						disabled={!props.hasProfile}
						onClick={toggle}
						data-testid="objects-toolbar-more"
						aria-label={moreButtonAriaLabel}
						aria-haspopup="menu"
						aria-expanded={open}
					>
						{buildMenuButtonLabel(moreButtonText, props.showLabels)}
					</Button>
				</Badge>
			)}
		</ObjectsMenuPopover>
	)

	const bucketPicker = (
		<ObjectsBucketPicker
			scopeKey={props.bucketPickerScopeKey}
			isDesktop={props.isDesktop}
			value={props.bucket}
			recentBuckets={props.recentBuckets}
			options={props.bucketOptions}
			placeholder={props.bucketsLoading && props.bucketOptions.length === 0 ? loadingBucketsPlaceholder() : bucketFieldPlaceholder()}
			disabled={!canUseBucket || (props.bucketsLoading && props.bucketOptions.length === 0)}
			className={props.isDesktop ? styles.toolbarBucketDesktop : styles.toolbarBucketMobile}
			onChange={props.onBucketChange}
			onOpenChange={props.onBucketDropdownVisibleChange}
		/>
	)

	const selectionActions = showSelectionPrimaryActions ? (
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
	) : null

	if (props.isDesktop) {
		const navButtons = props.isAdvanced ? (
			<>
				<Button
					size={navButtonSize}
					icon={<LeftOutlined />}
					disabled={!props.hasProfile || props.isOffline || !props.canGoBack}
					onClick={props.onGoBack}
					aria-label="Go back"
					title="Back"
				/>
				<Button
					size={navButtonSize}
					icon={<RightOutlined />}
					disabled={!props.hasProfile || props.isOffline || !props.canGoForward}
					onClick={props.onGoForward}
					aria-label="Go forward"
					title="Forward"
				/>
				<Button
					size={navButtonSize}
					icon={<UpOutlined />}
					disabled={!props.hasProfile || props.isOffline || !props.canGoUp}
					onClick={props.onGoUp}
					aria-label="Go up"
					title="Up"
				/>
			</>
		) : null
		const primaryActions = (
			<>
				{uploadButtonDesktop}
				{newFolderButton}
			</>
		)
		const utilityActions = moreButton

		return (
			<DesktopToolbarLayout
				bucketPicker={bucketPicker}
				navButtons={navButtons}
				primaryActions={primaryActions}
				selectionActions={selectionActions}
				utilityActions={utilityActions}
			/>
		)
	}

	return (
		<div className={styles.toolbarColumn}>
			<Space wrap size={[8, 8]} className={styles.toolbarTopRow} data-testid="objects-toolbar-mobile-top-row">
				<Space wrap size={[8, 8]} className={`${styles.toolbarGroup} ${styles.toolbarTopActions}`} data-testid="objects-toolbar-mobile-actions">
					{props.isAdvanced ? (
						<>
							{showMobileBack ? (
								<Button
									size="small"
									icon={<LeftOutlined />}
									onClick={props.onGoBack}
									aria-label="Go back"
									title="Back"
								/>
							) : null}
							{showMobileForward ? (
								<Button
									size="small"
									icon={<RightOutlined />}
									onClick={props.onGoForward}
									aria-label="Go forward"
									title="Forward"
								/>
							) : null}
							{showMobileUp ? (
								<Button
									size="small"
									icon={<UpOutlined />}
									onClick={props.onGoUp}
									aria-label="Go up"
								>
									{buildMenuButtonLabel('Up', props.showLabels)}
								</Button>
							) : null}
						</>
					) : null}
					{uploadButtonMobile}
					{showSelectionPrimaryActions ? (
						selectionActions
					) : null}
					{showMobileDetails ? (
						<Button
							size="small"
							icon={<InfoCircleOutlined />}
							onClick={props.onOpenDetails}
							disabled={!props.hasProfile || props.isOffline}
							aria-label="Details"
							aria-haspopup="dialog"
							aria-expanded={props.detailsDrawerOpen}
							aria-controls={OBJECTS_DETAILS_DRAWER_ID}
						>
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
