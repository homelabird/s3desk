import type { BreadcrumbProps } from 'antd'
import { Alert, Button, Breadcrumb, Input, Spin, Switch, Tooltip, Typography, message } from 'antd'
import { AppstoreOutlined, BarsOutlined, CopyOutlined, FilterOutlined, SearchOutlined, StarFilled, StarOutlined } from '@ant-design/icons'

import styles from './objects.module.css'
import type { ObjectSort, ObjectsViewMode } from './objectsTypes'
import { clipboardFailureHint, copyToClipboard } from '../../lib/clipboard'
import { NativeSelect } from '../../components/NativeSelect'

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
	sortOptions: Array<{ label: string; value: ObjectSort }>
	onSortChange: (value: ObjectSort) => void
	favoritesFirst: boolean
	onFavoritesFirstChange: (value: boolean) => void
	viewMode: ObjectsViewMode
	onViewModeChange: (value: ObjectsViewMode) => void
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
		<div className={styles.listControlsScopeRow}>
			<Typography.Text type="secondary">Search in this folder</Typography.Text>
			{globalSearchButton}
		</div>
	)

	const searchStatus =
		props.search.trim() && props.hasNextPage ? (
			props.rawTotalCount >= props.searchAutoScanCap ? (
				<Alert
					banner
					type="info"
					showIcon
					title={`Search paused at ${props.searchAutoScanCap.toLocaleString()} items`}
					description="Use Global Search (Indexed) to scan the full bucket."
					action={
						<Button size="small" type="primary" disabled={!props.canInteract} onClick={props.onOpenGlobalSearch}>
							Global Search (Indexed)
						</Button>
					}
					className={styles.listControlsStatusAlert}
				/>
			) : (
				<Typography.Text type="secondary" className={styles.listControlsStatusText}>
					<span className={styles.listControlsStatusInline}>
						{props.isFetchingNextPage ? <Spin size="small" /> : null}
						Searching more…
					</span>
				</Typography.Text>
			)
		) : null

	const sortControls = props.isAdvanced ? (
		<div className={styles.listControlsSortGroup}>
			<NativeSelect
				value={props.sort}
				onChange={(value) => props.onSortChange(value as ObjectSort)}
				ariaLabel="Sort objects"
				className={styles.listControlsSortSelect}
				disabled={!props.canInteract}
				options={props.sortOptions}
			/>
			<div className={styles.listControlsToggleRow}>
				<Switch
					size="small"
					checked={props.favoritesFirst}
					onChange={props.onFavoritesFirstChange}
					disabled={!props.canInteract || props.favoritesOnly}
					aria-label="Favorites first"
				/>
				<Typography.Text type="secondary">Favorites first</Typography.Text>
			</div>
		</div>
	) : null
	const viewModeToggle = (
		<div className={styles.listControlsViewToggle} role="group" aria-label="View mode">
			<Button
				size="small"
				icon={<BarsOutlined />}
				type={props.viewMode === 'list' ? 'primary' : 'default'}
				aria-pressed={props.viewMode === 'list'}
				onClick={() => props.onViewModeChange('list')}
			>
				List
			</Button>
			<Button
				size="small"
				icon={<AppstoreOutlined />}
				type={props.viewMode === 'grid' ? 'primary' : 'default'}
				aria-pressed={props.viewMode === 'grid'}
				onClick={() => props.onViewModeChange('grid')}
			>
				Grid
			</Button>
		</div>
	)

	return (
		<>
			<div className={styles.breadcrumbRow}>
				<div className={styles.breadcrumbLeft}>
					<div className={styles.listControlsLocationStack}>
						{location ? (
							<div className={styles.listControlsLocationRow}>
								<Typography.Text type="secondary">Location</Typography.Text>
								<Typography.Text
									code
									ellipsis={{ tooltip: location }}
									className={styles.listControlsLocationCode}
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
							</div>
						) : null}
						<Breadcrumb items={props.breadcrumbItems} />
					</div>
				</div>
				<div className={styles.listControlsTopActions}>
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
				</div>
			</div>

			{props.isCompact ? (
				<div className={styles.listControlsStack}>
					{searchScopeRow}
					<Input
						allowClear
						placeholder="Search current folder…"
						aria-label="Search current folder"
						className={styles.listControlsSearchInputFull}
						value={props.searchDraft}
						onChange={(e) => props.onSearchDraftChange(e.target.value)}
					/>
					<div className={styles.listControlsCompactFooter}>
						<Button
							icon={<FilterOutlined />}
							type={props.hasActiveView ? 'primary' : 'default'}
							onClick={props.onOpenFilters}
							disabled={!props.canInteract}
						>
							{props.isAdvanced ? 'View' : 'Filter'}
						</Button>
						{viewModeToggle}
						{props.isAdvanced ? (
							<Typography.Text type="secondary" className={styles.listControlsSummaryText}>
								{props.visiblePrefixCount} folders, {props.visibleFileCount} files
							</Typography.Text>
						) : null}
					</div>
					{sortControls}
					{searchStatus}
				</div>
			) : (
				<div className={styles.listControlsStack}>
					{searchScopeRow}
					<div className={styles.listControlsDesktopRow}>
						<div className={styles.listControlsDesktopLeft}>
							<Input
								allowClear
								placeholder="Search current folder…"
								aria-label="Search current folder"
								className={styles.listControlsSearchInput}
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
							{viewModeToggle}
							{sortControls}
						</div>
						{props.isAdvanced ? (
							<Typography.Text type="secondary" className={styles.listControlsSummaryText}>
								{props.visiblePrefixCount} folders, {props.visibleFileCount} files
							</Typography.Text>
						) : null}
					</div>

					{searchStatus}
				</div>
			)}
		</>
	)
}
