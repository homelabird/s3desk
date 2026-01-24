import type { BreadcrumbProps, SelectProps } from 'antd'
import { Alert, Button, Breadcrumb, Input, Select, Space, Spin, Switch, Tooltip, Typography, message } from 'antd'
import { CopyOutlined, FilterOutlined, SearchOutlined, StarFilled, StarOutlined } from '@ant-design/icons'

import styles from './objects.module.css'
import type { ObjectSort } from './objectsTypes'
import { clipboardFailureHint, copyToClipboard } from '../../lib/clipboard'

type ObjectsListControlsProps = {
	bucket: string
	prefix: string
	breadcrumbItems: BreadcrumbProps['items']
	isBookmarked: boolean
	onToggleBookmark: () => void
	onOpenPath: () => void
	isCompact: boolean
	searchDraft: string
	onSearchDraftChange: (value: string) => void
	hasActiveView: boolean
	onOpenFilters: () => void
	isAdvanced: boolean
	visiblePrefixCount: number
	visibleFileCount: number
	search: string
	hasNextPage: boolean
	isFetchingNextPage: boolean
	rawTotalCount: number
	searchAutoScanCap: number
	onOpenGlobalSearch: () => void
	canInteract: boolean
	favoritesOnly: boolean
	sort: ObjectSort
	sortOptions: SelectProps['options']
	onSortChange: (value: ObjectSort) => void
	favoritesFirst: boolean
	onFavoritesFirstChange: (value: boolean) => void
}

function buildS3Location(bucket: string, prefix: string): string {
	if (!bucket) return ''
	const p = (prefix ?? '').replace(/^\/+/, '')
	return p ? `s3://${bucket}/${p}` : `s3://${bucket}/`
}

export function ObjectsListControls(props: ObjectsListControlsProps) {
	const location = buildS3Location(props.bucket, props.prefix)

	const copyLocation = async () => {
		if (!location) return
		const res = await copyToClipboard(location)
		if (res.ok) message.success('Copied')
		else message.warning(clipboardFailureHint())
	}

	const globalSearchButton = props.isAdvanced ? (
		<Button size="small" icon={<SearchOutlined />} disabled={!props.canInteract} onClick={props.onOpenGlobalSearch}>
			Global Search (Indexed)
		</Button>
	) : null

	const searchScopeRow = (
		<Space wrap size="small" align="center">
			<Typography.Text type="secondary">Search in this folder</Typography.Text>
			{globalSearchButton}
		</Space>
	)

	const searchStatus =
		props.search.trim() && props.hasNextPage ? (
			props.rawTotalCount >= props.searchAutoScanCap ? (
				<Alert
					banner
					type="info"
					showIcon
					message={`Search paused at ${props.searchAutoScanCap.toLocaleString()} items`}
					description="Use Global Search (Indexed) to scan the full bucket."
					action={
						<Button size="small" type="primary" disabled={!props.canInteract} onClick={props.onOpenGlobalSearch}>
							Global Search (Indexed)
						</Button>
					}
					style={{ width: '100%' }}
				/>
			) : (
				<Typography.Text type="secondary">
					<Space size={6}>
						{props.isFetchingNextPage ? <Spin size="small" /> : null}
						Searching more…
					</Space>
				</Typography.Text>
			)
		) : null

	const sortControls = props.isAdvanced ? (
		<Space wrap size="small" align="center">
			<Select
				value={props.sort}
				options={props.sortOptions}
				style={{ minWidth: 180 }}
				aria-label="Sort objects"
				onChange={(value) => props.onSortChange(value as ObjectSort)}
				disabled={!props.canInteract}
			/>
			<Space size={6} align="center">
				<Switch
					size="small"
					checked={props.favoritesFirst}
					onChange={props.onFavoritesFirstChange}
					disabled={!props.canInteract || props.favoritesOnly}
					aria-label="Favorites first"
				/>
				<Typography.Text type="secondary">Favorites first</Typography.Text>
			</Space>
		</Space>
	) : null

	return (
		<>
			<div className={styles.breadcrumbRow}>
				<div className={styles.breadcrumbLeft}>
					<Space direction="vertical" size={2} style={{ width: '100%' }}>
						{location ? (
							<Space size={6} wrap style={{ minWidth: 0 }}>
								<Typography.Text type="secondary">Location</Typography.Text>
								<Typography.Text
									code
									ellipsis={{ tooltip: location }}
									style={{ maxWidth: 640, minWidth: 0, display: 'inline-block' }}
								>
									{location}
								</Typography.Text>
								<Tooltip title="Copy location">
									<Button
										type="text"
										size="small"
										icon={<CopyOutlined />}
										onClick={copyLocation}
										disabled={!props.canInteract}
										aria-label="Copy location"
									/>
								</Tooltip>
							</Space>
						) : null}
						<Breadcrumb items={props.breadcrumbItems} />
					</Space>
				</div>
				<Space size="small">
					<Tooltip title={props.isBookmarked ? 'Remove bookmark' : 'Add bookmark'}>
						<Button
							type="text"
							icon={props.isBookmarked ? <StarFilled /> : <StarOutlined />}
							onClick={props.onToggleBookmark}
							disabled={!props.canInteract}
							aria-label={props.isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
						/>
					</Tooltip>
					<Tooltip title="Go to path (Ctrl+L)">
						<Button
							type="text"
							icon={<SearchOutlined />}
							onClick={props.onOpenPath}
							disabled={!props.canInteract}
							aria-label="Go to path"
						/>
					</Tooltip>
				</Space>
			</div>

			{props.isCompact ? (
				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					{searchScopeRow}
						<Input
							allowClear
							placeholder="Search current folder…"
							aria-label="Search current folder"
							style={{ width: '100%', maxWidth: '100%' }}
							value={props.searchDraft}
							onChange={(e) => props.onSearchDraftChange(e.target.value)}
						/>
					<Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
						<Button
							icon={<FilterOutlined />}
							type={props.hasActiveView ? 'primary' : 'default'}
							onClick={props.onOpenFilters}
							disabled={!props.canInteract}
						>
							{props.isAdvanced ? 'View' : 'Filter'}
						</Button>
						{props.isAdvanced ? (
							<Typography.Text type="secondary">
								{props.visiblePrefixCount} folders, {props.visibleFileCount} files
							</Typography.Text>
						) : null}
					</Space>
					{sortControls}
					{searchStatus}
				</Space>
			) : (
				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					{searchScopeRow}
					<Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
						<Space wrap>
								<Input
									allowClear
									placeholder="Search current folder…"
									aria-label="Search current folder"
									style={{ width: 320, maxWidth: '100%' }}
									value={props.searchDraft}
									onChange={(e) => props.onSearchDraftChange(e.target.value)}
								/>
							<Button
								icon={<FilterOutlined />}
								type={props.hasActiveView ? 'primary' : 'default'}
								onClick={props.onOpenFilters}
								disabled={!props.canInteract}
							>
								{props.isAdvanced ? 'View' : 'Filter'}
							</Button>
							{sortControls}
						</Space>
						{props.isAdvanced ? (
							<Typography.Text type="secondary">
								{props.visiblePrefixCount} folders, {props.visibleFileCount} files
							</Typography.Text>
						) : null}
					</Space>

					{searchStatus}
				</Space>
			)}
		</>
	)
}
