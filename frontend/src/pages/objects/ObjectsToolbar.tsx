import type { ReactNode } from 'react'
import type { MenuProps, SelectProps } from 'antd'
import { Badge, Button, Dropdown, Select, Space, Tooltip } from 'antd'
import { CloudUploadOutlined, DeleteOutlined, DownloadOutlined, EllipsisOutlined, FolderOutlined, InfoCircleOutlined, LeftOutlined, ReloadOutlined, RightOutlined, SwapOutlined, UpOutlined } from '@ant-design/icons'

import type { UIAction } from './objectsActions'
import styles from './objects.module.css'

export type ObjectsToolbarProps = {
	isDesktop: boolean
	showLabels: boolean
	isAdvanced: boolean
	isOffline: boolean
	hasProfile: boolean
	bucket: string
	selectedCount: number
	bucketOptions: SelectProps['options']
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
	onUploadFiles: () => void
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

export function ObjectsToolbar(props: ObjectsToolbarProps) {
	const canUseBucket = props.hasProfile && !props.isOffline
	const canUpload = props.hasProfile && !!props.bucket && !props.isOffline
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

	const renderPrimaryActionButton = (action: UIAction | undefined, opts: { icon: ReactNode; fallbackLabel: string; danger?: boolean; tooltip: string }) => {
		if (!action) return null
		const label = props.showLabels ? action.shortLabel ?? action.label ?? opts.fallbackLabel : null
		const disabled = !action.enabled
		const button = (
			<Button size="middle" icon={opts.icon} danger={opts.danger} disabled={disabled} onClick={action.run}>
				{label}
			</Button>
		)
		return (
			<Tooltip title={disabled ? opts.tooltip : action.label ?? opts.fallbackLabel}>
				<span>{button}</span>
			</Tooltip>
		)
	}

	if (props.isDesktop) {
		return (
			<div className={styles.toolbarRow}>
				<Space wrap className={styles.toolbarGroup}>
					{props.isAdvanced ? (
						<>
							<Tooltip title="Back">
								<Button icon={<LeftOutlined />} disabled={!props.hasProfile || props.isOffline || !props.canGoBack} onClick={props.onGoBack} />
							</Tooltip>
							<Tooltip title="Forward">
								<Button icon={<RightOutlined />} disabled={!props.hasProfile || props.isOffline || !props.canGoForward} onClick={props.onGoForward} />
							</Tooltip>
							<Tooltip title="Up">
								<Button icon={<UpOutlined />} disabled={!props.hasProfile || props.isOffline || !props.canGoUp} onClick={props.onGoUp} />
							</Tooltip>
						</>
					) : null}

					<Select
						allowClear
						showSearch
						placeholder="Bucket"
						style={{ width: 260, maxWidth: '100%' }}
						value={props.bucket || undefined}
						options={props.bucketOptions}
						loading={props.bucketsLoading}
						onChange={(value) => props.onBucketChange(value ?? null)}
						onDropdownVisibleChange={props.onBucketDropdownVisibleChange}
						optionFilterProp="label"
						disabled={!canUseBucket}
					/>
				</Space>

				<Space wrap className={`${styles.toolbarGroup} ${styles.toolbarGroupRight}`}>
					<Dropdown.Button
						type="primary"
						icon={<CloudUploadOutlined />}
						disabled={!canUpload}
						menu={props.uploadMenu}
						onClick={props.onUploadFiles}
					>
						Upload
					</Dropdown.Button>
					{props.showPrimaryActions ? (
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
					<Tooltip title="Transfers">
						<Badge count={props.activeTransferCount} size="small" showZero={false}>
							<Button icon={<SwapOutlined />} onClick={props.onOpenTransfers}>
								{props.showLabels ? 'Transfers' : null}
							</Button>
						</Badge>
					</Tooltip>
					{props.isAdvanced ? (
						<Tooltip title="Refresh">
							<Button
								icon={<ReloadOutlined />}
								onClick={props.onRefresh}
								loading={props.isRefreshing}
								disabled={!props.hasProfile || props.isOffline || !props.bucket}
							/>
						</Tooltip>
					) : null}
					<Dropdown trigger={['click']} menu={props.topMoreMenu}>
						<Button icon={<EllipsisOutlined />} disabled={!props.hasProfile || props.isOffline} data-testid="objects-toolbar-more">
							More
						</Button>
					</Dropdown>
				</Space>
			</div>
		)
	}

	return (
		<div className={styles.toolbarColumn}>
			<Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
				<Space wrap className={styles.toolbarGroup}>
					{props.isAdvanced ? (
						<>
							<Tooltip title="Back">
								<Button icon={<LeftOutlined />} disabled={!props.hasProfile || props.isOffline || !props.canGoBack} onClick={props.onGoBack} />
							</Tooltip>
							<Tooltip title="Forward">
								<Button icon={<RightOutlined />} disabled={!props.hasProfile || props.isOffline || !props.canGoForward} onClick={props.onGoForward} />
							</Tooltip>
							<Button icon={<UpOutlined />} disabled={!props.hasProfile || props.isOffline || !props.canGoUp} onClick={props.onGoUp}>
								Up
							</Button>
						</>
					) : null}
					<Dropdown menu={props.uploadMenu} trigger={['click']}>
						<Button icon={<CloudUploadOutlined />} disabled={!canUpload}>
							{props.showLabels ? 'Upload' : null}
						</Button>
					</Dropdown>
					{props.showPrimaryActions ? (
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
					<Tooltip title="Transfers">
						<Badge count={props.activeTransferCount} size="small" showZero={false}>
							<Button icon={<SwapOutlined />} onClick={props.onOpenTransfers}>
								{props.showLabels ? 'Transfers' : null}
							</Button>
						</Badge>
					</Tooltip>
					{props.isAdvanced && !props.dockTree ? (
						<Button icon={<FolderOutlined />} onClick={props.onOpenTree} disabled={!props.hasProfile || props.isOffline}>
							{props.showLabels ? 'Folders' : null}
						</Button>
					) : null}
					{props.isAdvanced && !props.dockDetails ? (
						<Button icon={<InfoCircleOutlined />} onClick={props.onOpenDetails} disabled={!props.hasProfile || props.isOffline}>
							{props.showLabels ? 'Details' : null}
						</Button>
					) : null}
				</Space>

				<Dropdown trigger={['click']} menu={props.topMoreMenu}>
					<Button icon={<EllipsisOutlined />} disabled={!props.hasProfile || props.isOffline} data-testid="objects-toolbar-more">
						{props.showLabels ? 'Actions' : null}
					</Button>
				</Dropdown>
			</Space>

			<Select
				allowClear
				showSearch
				placeholder="Bucket"
				style={{ width: '100%', maxWidth: '100%' }}
				value={props.bucket || undefined}
				options={props.bucketOptions}
				loading={props.bucketsLoading}
				onChange={(value) => props.onBucketChange(value ?? null)}
				onDropdownVisibleChange={props.onBucketDropdownVisibleChange}
				optionFilterProp="label"
				disabled={!canUseBucket}
			/>
		</div>
	)
}
