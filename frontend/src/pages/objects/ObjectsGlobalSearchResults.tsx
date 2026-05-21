import { CopyOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { Button, Empty, Spin, Typography } from 'antd'

import type { ObjectItem } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'
import styles from './ObjectsSearch.module.css'

type ObjectsGlobalSearchResultsProps = {
	hasNextPage: boolean
	isFetching: boolean
	isFetchingNextPage: boolean
	isMd: boolean
	useWideResults: boolean
	items: ObjectItem[]
	onCopyKey: (key: string) => void
	onDownloadKey: (key: string, size?: number) => void
	onLoadMore: () => void
	onOpenDetails: (key: string) => void
	onOpenPrefixForKey: (key: string) => void
	searchQueryText: string
}

function ObjectsGlobalSearchResultActions({
	compact,
	onCopyKey,
	onDownloadKey,
	onOpenDetails,
	onOpenPrefixForKey,
	row,
}: Pick<
	ObjectsGlobalSearchResultsProps,
	'onCopyKey' | 'onDownloadKey' | 'onOpenDetails' | 'onOpenPrefixForKey'
> & {
	compact: boolean
	row: ObjectItem
}) {
	return (
		<div
			className={compact ? styles.globalSearchResultActions : styles.globalSearchActionRow}
			data-global-search-table-action-row={compact ? undefined : 'true'}
		>
				<Button
					size="small"
					className={compact ? styles.globalSearchResultPrimaryButton : undefined}
					aria-label={`Open ${row.key}`}
					title={`Open ${row.key}`}
					onClick={() => onOpenPrefixForKey(row.key)}
				>
					Open
				</Button>
			<Button
				size="small"
				className={compact ? styles.globalSearchResultIconButton : undefined}
				icon={<CopyOutlined />}
				aria-label={`Copy key ${row.key}`}
				onClick={() => onCopyKey(row.key)}
			/>
			<Button
				size="small"
				className={compact ? styles.globalSearchResultIconButton : undefined}
				icon={<DownloadOutlined />}
				aria-label={`Download ${row.key}`}
				onClick={() => onDownloadKey(row.key, row.size)}
			/>
				<Button
					size="small"
					className={compact ? styles.globalSearchResultSecondaryButton : undefined}
					icon={<InfoCircleOutlined />}
					aria-label={`Open details for ${row.key}`}
					title={`Open details for ${row.key}`}
					onClick={() => onOpenDetails(row.key)}
				>
					{compact ? 'Details' : null}
			</Button>
		</div>
	)
}

export function ObjectsGlobalSearchResults({
	hasNextPage,
	isFetching,
	isFetchingNextPage,
	isMd,
	useWideResults,
	items,
	onCopyKey,
	onDownloadKey,
	onLoadMore,
	onOpenDetails,
	onOpenPrefixForKey,
	searchQueryText,
}: ObjectsGlobalSearchResultsProps) {
	const buttonSize = isMd ? 'middle' : 'small'
	const showMobileResults = !useWideResults
	const tableWrapClass = `${styles.globalSearchTableWrap} ${isMd ? styles.globalSearchTableWrapMd : ''}`
	const tableClass = `${styles.globalSearchTable} ${isMd ? styles.globalSearchTableMd : styles.globalSearchTableSm}`
	const keyTextClass = `${styles.globalSearchKeyText} ${isMd ? styles.globalSearchKeyTextMd : styles.globalSearchKeyTextSm}`

	if (!searchQueryText) {
		return <Empty description="Type a query to search" />
	}

	if (isFetching && items.length === 0) {
		return (
			<div className={styles.loadingRow} role="status" aria-live="polite" aria-label="Loading search results">
				<Spin />
				<Typography.Text type="secondary">Loading results...</Typography.Text>
			</div>
		)
	}

	if (items.length === 0) {
		return <Empty description="No results" />
	}

	return (
		<>
				<p className={styles.globalSearchResultsMeta} role="status" aria-live="polite">
					{items.length} result(s)
				{hasNextPage ? ' (more available)' : ''}
			</p>
			{showMobileResults ? (
				<div className={styles.globalSearchResultsList} data-testid="objects-global-search-results">
					{items.map((row) => (
						<article key={row.key} className={styles.globalSearchResultCard} data-global-search-result-card="true">
							<code title={row.key} className={styles.globalSearchResultKey} data-global-search-result-key="true">
								{row.key}
							</code>
							<div className={styles.globalSearchResultMeta}>
								<span className={styles.globalSearchResultMetaItem}>
									<span className={styles.globalSearchMuted}>Size</span>
									<strong>{typeof row.size === 'number' && row.size >= 0 ? formatBytes(row.size) : '-'}</strong>
								</span>
								<span className={styles.globalSearchResultMetaItem}>
									<span className={styles.globalSearchMuted}>Modified</span>
									<strong>{row.lastModified ? formatDateTime(row.lastModified, { showSeconds: false }) : '-'}</strong>
								</span>
							</div>
							<ObjectsGlobalSearchResultActions
								compact
								row={row}
								onCopyKey={onCopyKey}
								onDownloadKey={onDownloadKey}
								onOpenDetails={onOpenDetails}
								onOpenPrefixForKey={onOpenPrefixForKey}
							/>
						</article>
					))}
				</div>
			) : (
				<div className={tableWrapClass} data-testid="objects-global-search-table-wrap">
					<table className={tableClass}>
						<caption className="sr-only">Global object search results</caption>
						<thead>
							<tr>
								<th scope="col" className={styles.globalSearchTh}>Key</th>
								<th scope="col" className={`${styles.globalSearchTh} ${styles.globalSearchThSize}`}>Size</th>
								<th scope="col" className={`${styles.globalSearchTh} ${styles.globalSearchThModified}`}>Last modified</th>
								<th scope="col" className={`${styles.globalSearchTh} ${styles.globalSearchThActions}`}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{items.map((row) => (
								<tr key={row.key}>
									<td className={styles.globalSearchTd}>
										<code title={row.key} className={keyTextClass}>
											{row.key}
										</code>
									</td>
									<td className={styles.globalSearchTd}>
										<span className={styles.globalSearchMuted}>
											{typeof row.size === 'number' && row.size >= 0 ? formatBytes(row.size) : '-'}
										</span>
									</td>
									<td className={styles.globalSearchTd}>
										{row.lastModified ? (
											<code title={row.lastModified} className={styles.globalSearchDateText}>
												{formatDateTime(row.lastModified, { showSeconds: false })}
											</code>
										) : (
											<span className={styles.globalSearchMuted}>-</span>
										)}
									</td>
									<td className={styles.globalSearchTd}>
										<ObjectsGlobalSearchResultActions
											compact={false}
											row={row}
											onCopyKey={onCopyKey}
											onDownloadKey={onDownloadKey}
											onOpenDetails={onOpenDetails}
											onOpenPrefixForKey={onOpenPrefixForKey}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<div className={styles.globalSearchLoadMoreRow}>
				<Button
					size={buttonSize}
					className={styles.globalSearchCompactButton}
					onClick={onLoadMore}
					disabled={!hasNextPage}
					loading={isFetchingNextPage}
				>
					Load more
				</Button>
			</div>
		</>
	)
}
