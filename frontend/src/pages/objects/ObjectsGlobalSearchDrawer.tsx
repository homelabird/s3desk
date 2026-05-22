import { InfoCircleOutlined } from '@ant-design/icons'
import { Alert, Button } from 'antd'

import type { ObjectItem } from '../../api/types'
import { selectBucketFirstHint, selectProfileFirstHint } from '../../lib/actionHints'
import { ObjectsGlobalSearchControls } from './ObjectsGlobalSearchControls'
import { ObjectsGlobalSearchIndexPanel } from './ObjectsGlobalSearchIndexPanel'
import { ObjectsGlobalSearchResults } from './ObjectsGlobalSearchResults'
import { ObjectsOverlaySheet } from './ObjectsOverlaySheet'
import styles from './ObjectsSearch.module.css'

type ObjectsGlobalSearchDrawerProps = {
	scopeKey: string
	open: boolean
	onClose: () => void
	hasProfile: boolean
	hasBucket: boolean
	bucket: string
	currentPrefix: string
	isMd: boolean
	useWideResults: boolean
	queryDraft: string
	onQueryDraftChange: (value: string) => void
	prefixFilter: string
	onPrefixFilterChange: (value: string) => void
	limit: number
	onLimitChange: (value: number) => void
	extFilter: string
	onExtFilterChange: (value: string) => void
	minSizeBytes: number | null
	maxSizeBytes: number | null
	onMinSizeBytesChange: (value: number | null) => void
	onMaxSizeBytesChange: (value: number | null) => void
	modifiedAfterMs: number | null
	modifiedBeforeMs: number | null
	onModifiedRangeChange: (startMs: number | null, endMs: number | null) => void
	onReset: () => void
	onRefresh: () => void
	isRefreshing: boolean
	isError: boolean
	isNotIndexed: boolean
	errorMessage: string
	onCreateIndexJob: () => void
	isCreatingIndexJob: boolean
	indexPrefix: string
	onIndexPrefixChange: (value: string) => void
	indexFullReindex: boolean
	onIndexFullReindexChange: (value: boolean) => void
	searchQueryText: string
	isFetching: boolean
	hasNextPage: boolean
	isFetchingNextPage: boolean
	items: ObjectItem[]
	onLoadMore: () => void
	onUseCurrentPrefix: () => void
	onOpenPrefixForKey: (key: string) => void
	onCopyKey: (key: string) => void
	onDownloadKey: (key: string, size?: number) => void
	onOpenDetails: (key: string) => void
}

export function ObjectsGlobalSearchDrawer(props: ObjectsGlobalSearchDrawerProps) {
	const drawerWidth = props.isMd ? 'min(92vw, 920px)' : '100%'

	return (
		<ObjectsOverlaySheet
			open={props.open}
			onClose={props.onClose}
			width={drawerWidth}
			placement="right"
			title="Search bucket"
			dataTestId="objects-global-search-sheet"
			compactMobile
		>
			{!props.hasProfile ? (
				<Alert type="warning" showIcon title={selectProfileFirstHint()} />
			) : !props.hasBucket ? (
				<Alert type="warning" showIcon title={selectBucketFirstHint()} />
			) : (
				<div className={styles.globalSearchContent} data-testid="objects-global-search-content">
					<section className={styles.globalSearchSection}>
						<Alert
							type="info"
							showIcon
							icon={<InfoCircleOutlined />}
							title="Search across this bucket"
							description="Find objects outside the current folder, then narrow by folder, file type, size, or modified date. If search has not been prepared yet, build the index below."
							className={styles.globalSearchIntro}
						/>
					</section>

						<ObjectsGlobalSearchControls
							extFilter={props.extFilter}
							isMd={props.isMd}
							isRefreshing={props.isRefreshing}
							limit={props.limit}
							maxSizeBytes={props.maxSizeBytes}
							minSizeBytes={props.minSizeBytes}
							modifiedAfterMs={props.modifiedAfterMs}
							modifiedBeforeMs={props.modifiedBeforeMs}
							onExtFilterChange={props.onExtFilterChange}
							onLimitChange={props.onLimitChange}
							onMaxSizeBytesChange={props.onMaxSizeBytesChange}
							onMinSizeBytesChange={props.onMinSizeBytesChange}
							onModifiedRangeChange={props.onModifiedRangeChange}
							onPrefixFilterChange={props.onPrefixFilterChange}
							onQueryDraftChange={props.onQueryDraftChange}
							onRefresh={props.onRefresh}
							onReset={props.onReset}
							prefixFilter={props.prefixFilter}
							queryDraft={props.queryDraft}
						/>

					{props.isError ? (
						props.isNotIndexed ? (
							<Alert
								type="info"
								showIcon
								title="Search index needed"
								description="Build the search index first, then search again."
								action={
									<Button type="primary" size="small" className={styles.globalSearchCompactButton} onClick={props.onCreateIndexJob} loading={props.isCreatingIndexJob}>
										Build index
									</Button>
								}
							/>
						) : (
							<Alert type="error" showIcon title="Search failed" description={props.errorMessage} />
						)
					) : null}

					<ObjectsGlobalSearchIndexPanel
						key={`${props.scopeKey}:${props.bucket}:${props.isNotIndexed ? 'index-missing' : 'index-ready'}`}
						bucket={props.bucket}
						currentPrefix={props.currentPrefix}
						indexPrefix={props.indexPrefix}
						onIndexPrefixChange={props.onIndexPrefixChange}
						onUseCurrentPrefix={props.onUseCurrentPrefix}
						indexFullReindex={props.indexFullReindex}
						onIndexFullReindexChange={props.onIndexFullReindexChange}
						onCreateIndexJob={props.onCreateIndexJob}
						isCreatingIndexJob={props.isCreatingIndexJob}
						isNotIndexed={props.isNotIndexed}
						isMd={props.isMd}
					/>

					<div className={styles.globalSearchDivider} />

						<ObjectsGlobalSearchResults
							hasNextPage={props.hasNextPage}
							isFetching={props.isFetching}
							isFetchingNextPage={props.isFetchingNextPage}
							isMd={props.isMd}
							useWideResults={props.useWideResults}
							items={props.items}
							onCopyKey={props.onCopyKey}
							onDownloadKey={props.onDownloadKey}
							onLoadMore={props.onLoadMore}
							onOpenDetails={props.onOpenDetails}
							onOpenPrefixForKey={props.onOpenPrefixForKey}
							searchQueryText={props.searchQueryText}
						/>
				</div>
			)}
		</ObjectsOverlaySheet>
	)
}
