import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Input, Spin } from 'antd'
import {
	AppstoreOutlined,
	BarsOutlined,
	CopyOutlined,
	FilterOutlined,
	SearchOutlined,
	StarFilled,
	StarOutlined,
} from '@ant-design/icons'

import styles from './ObjectsListView.module.css'
import type { ObjectSort, ObjectsViewMode } from './objectsTypes'
import { clipboardFailureHint, copyToClipboard } from '../../lib/clipboard'
import { NativeSelect } from '../../components/NativeSelect'
import { buildS3Location } from './objectsLocationUtils'

type BreadcrumbItem = {
	title: ReactNode
}

type ObjectsListControlsProps = {
	bucket: string
	prefix: string
	breadcrumbItems: BreadcrumbItem[]
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

type CopyFeedback = 'copied' | 'failed' | null

function renderBreadcrumb(items: BreadcrumbItem[]) {
	if (!items.length) return null
	return (
		<nav className={styles.breadcrumbNav} aria-label="Location breadcrumb">
			<ol className={styles.breadcrumbList}>
				{items.map((item, index) => (
					<li key={`crumb-${index}`} className={styles.breadcrumbListItem}>
						{index > 0 ? <span className={styles.breadcrumbSeparator}>/</span> : null}
						{item.title}
					</li>
				))}
			</ol>
		</nav>
	)
}

export function ObjectsListControls(props: ObjectsListControlsProps) {
	const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null)
	const location = buildS3Location(props.bucket, props.prefix)
	const searchTrimmed = props.search.trim()
	const searchCapped = !!searchTrimmed && props.hasNextPage && props.rawTotalCount >= props.searchAutoScanCap
	const compactUsesInlineIndexedCta = props.isCompact && searchCapped && !props.isAdvanced
	const globalSearchLabel = 'Search bucket'

	useEffect(() => {
		if (!copyFeedback) return
		const timeoutId = window.setTimeout(() => setCopyFeedback(null), 1600)
		return () => window.clearTimeout(timeoutId)
	}, [copyFeedback])

	const copyLocation = async () => {
		if (!location) return
		const result = await copyToClipboard(location)
		setCopyFeedback(result.ok ? 'copied' : 'failed')
	}

	const globalSearchButton = props.isAdvanced ? (
		<Button
			size="small"
			icon={<SearchOutlined />}
			disabled={!props.canInteract}
			onClick={props.onOpenGlobalSearch}
			aria-label={globalSearchLabel}
		>
			{globalSearchLabel}
		</Button>
	) : null

	const searchStatus =
		searchTrimmed && props.hasNextPage ? (
			searchCapped ? (
				props.isCompact ? (
					<div
						className={styles.listControlsStatusCompact}
						data-testid="objects-list-controls-status-compact"
						data-has-action={compactUsesInlineIndexedCta ? 'true' : 'false'}
						role="status"
					>
						<div className={styles.listControlsStatusCompactText}>
							<strong className={styles.listControlsStatusCompactTitle}>
								{`Search paused at ${props.searchAutoScanCap.toLocaleString()} items`}
							</strong>
							<span className={`${styles.listControlsStatusCompactHint} ${styles.listControlsSecondaryText}`}>
								{props.isAdvanced
									? 'Use Search bucket above to scan the whole bucket.'
									: 'Use Search bucket to scan the whole bucket.'}
							</span>
						</div>
						{compactUsesInlineIndexedCta ? (
							<Button
								size="small"
								type="primary"
								icon={<SearchOutlined />}
								disabled={!props.canInteract}
								onClick={props.onOpenGlobalSearch}
								aria-label={globalSearchLabel}
								className={styles.listControlsStatusCompactAction}
							>
								{globalSearchLabel}
							</Button>
						) : null}
					</div>
				) : (
					<Alert
						banner
						type="info"
						showIcon
						title={`Search paused at ${props.searchAutoScanCap.toLocaleString()} items`}
						description="Use Search bucket to scan the full bucket. Build the search index when prompted."
						action={
							<Button size="small" type="primary" disabled={!props.canInteract} onClick={props.onOpenGlobalSearch}>
								{globalSearchLabel}
							</Button>
						}
						className={styles.listControlsStatusAlert}
					/>
				)
			) : (
				<span className={`${styles.listControlsStatusText} ${styles.listControlsSecondaryText}`}>
					<span className={styles.listControlsStatusInline}>
						{props.isFetchingNextPage ? <Spin size="small" /> : null}
						Searching more…
					</span>
				</span>
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
				<button
					type="button"
					role="switch"
					aria-checked={props.favoritesFirst}
					aria-label="Favorites first"
					className={`${styles.listControlsSwitch} ${props.favoritesFirst ? styles.listControlsSwitchChecked : ''}`.trim()}
					disabled={!props.canInteract || props.favoritesOnly}
					onClick={() => props.onFavoritesFirstChange(!props.favoritesFirst)}
				>
					<span className={styles.listControlsSwitchThumb} />
				</button>
				<span className={styles.listControlsSecondaryText}>Favorites first</span>
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

	const locationFeedback =
		copyFeedback === 'copied' ? (
			<span className={styles.listControlsCopyFeedback}>Copied</span>
		) : copyFeedback === 'failed' ? (
			<span className={styles.listControlsCopyFeedback}>{clipboardFailureHint()}</span>
		) : null
	const showInlinePathShortcut = props.isAdvanced && !props.isCompact
	const showInlineLocationBookmark = !props.isCompact
	const showInlineCopyLocation = !props.isCompact
	const bookmarkLocationLabel = props.isBookmarked ? 'Remove location bookmark' : 'Bookmark this location'

	const filterButton = (
		<Button
			size="small"
			icon={<FilterOutlined />}
			type={props.hasActiveView ? 'primary' : 'default'}
			onClick={props.onOpenFilters}
			disabled={!props.canInteract}
		>
			{props.isCompact ? 'Filters' : props.isAdvanced ? 'View' : 'Filter'}
		</Button>
	)

	return (
		<div className={styles.listControlsSection} data-testid="objects-list-controls-root" data-compact={props.isCompact ? 'true' : 'false'}>
			<div className={styles.breadcrumbRow}>
				<div className={styles.breadcrumbLeft}>
					<div className={styles.listControlsLocationStack}>
						{location ? (
							<div className={styles.listControlsLocationRow}>
								<span className={styles.listControlsLocationCode} title={location}>
									{location}
								</span>
								{showInlineCopyLocation ? (
									<button
										type="button"
										className={styles.listControlsIconButton}
										onClick={copyLocation}
										disabled={!props.canInteract}
										aria-label="Copy location"
										title="Copy location"
									>
										<CopyOutlined />
									</button>
								) : null}
								{locationFeedback}
							</div>
						) : null}
						{renderBreadcrumb(props.breadcrumbItems)}
					</div>
				</div>
				<div className={styles.listControlsTopActions}>
					{showInlineLocationBookmark ? (
						<button
							type="button"
							className={styles.listControlsIconButton}
							onClick={props.onToggleBookmark}
							disabled={!props.canInteract}
							aria-label={bookmarkLocationLabel}
							title={bookmarkLocationLabel}
						>
							{props.isBookmarked ? <StarFilled /> : <StarOutlined />}
						</button>
					) : null}
					{showInlinePathShortcut ? (
						<button
							type="button"
							className={styles.listControlsIconButton}
							onClick={props.onOpenPath}
							disabled={!props.canInteract}
							aria-label="Go to path"
							title="Go to path (Ctrl+L)"
						>
							<SearchOutlined />
						</button>
					) : null}
				</div>
			</div>

			{props.isCompact ? (
				<div className={styles.listControlsStack}>
					<Input
						allowClear
						placeholder="Search current folder…"
						aria-label="Search current folder"
						className={styles.listControlsSearchInputFull}
						value={props.searchDraft}
						onChange={(event) => props.onSearchDraftChange(event.target.value)}
					/>
					<div className={styles.listControlsCompactFooter} data-testid="objects-list-controls-compact-footer">
						<div className={styles.listControlsCompactActions}>
							{filterButton}
							{globalSearchButton}
						</div>
						{viewModeToggle}
					</div>
					{props.isAdvanced ? (
						<div className={styles.listControlsCompactMeta} data-testid="objects-list-controls-compact-meta">
							<span className={`${styles.listControlsSummaryText} ${styles.listControlsSecondaryText}`}>
								{props.visiblePrefixCount} folders, {props.visibleFileCount} files
							</span>
							<span className={`${styles.listControlsHintText} ${styles.listControlsSecondaryText}`}>
								Search here, or use Search bucket for the whole bucket.
							</span>
						</div>
					) : null}
					{searchStatus}
				</div>
			) : (
				<div className={styles.listControlsStack}>
					<div className={styles.listControlsDesktopRow} data-testid="objects-list-controls-desktop-row">
						<Input
							allowClear
							placeholder="Search current folder…"
							aria-label="Search current folder"
							className={styles.listControlsSearchInput}
							value={props.searchDraft}
							onChange={(event) => props.onSearchDraftChange(event.target.value)}
						/>
						<div className={styles.listControlsDesktopLeft} data-testid="objects-list-controls-desktop-actions">
							{filterButton}
							{globalSearchButton}
							{viewModeToggle}
							{sortControls}
						</div>
						{props.isAdvanced ? (
							<span
								className={`${styles.listControlsSummaryText} ${styles.listControlsSecondaryText}`.trim()}
								data-testid="objects-list-controls-summary"
							>
								{props.visiblePrefixCount} folders, {props.visibleFileCount} files
							</span>
						) : null}
					</div>

					{searchStatus}
				</div>
			)}
		</div>
	)
}
