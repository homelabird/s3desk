import type { BreadcrumbProps } from 'antd'
import { Alert, Button, Breadcrumb, Input, Space, Spin, Tooltip, Typography } from 'antd'
import { FilterOutlined, SearchOutlined, StarFilled, StarOutlined } from '@ant-design/icons'

import styles from './objects.module.css'

type ObjectsListControlsProps = {
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
}

export function ObjectsListControls(props: ObjectsListControlsProps) {
	const globalSearchButton = (
		<Button size="small" icon={<SearchOutlined />} disabled={!props.canInteract} onClick={props.onOpenGlobalSearch}>
			Global Search (Indexed)
		</Button>
	)
	const searchScopeRow = (
		<Space wrap size="small" align="center">
			<Typography.Text type="secondary">Local search (current folder)</Typography.Text>
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

	return (
		<>
			<div className={styles.breadcrumbRow}>
				<div className={styles.breadcrumbLeft}>
					<Breadcrumb items={props.breadcrumbItems} />
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
					{props.isAdvanced ? (
						<Tooltip title="Go to path (Ctrl+L)">
							<Button
								type="text"
								icon={<SearchOutlined />}
								onClick={props.onOpenPath}
								disabled={!props.canInteract}
								aria-label="Go to path"
							/>
						</Tooltip>
					) : null}
				</Space>
			</div>

			{props.isCompact ? (
				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					{searchScopeRow}
					<Input
						allowClear
						placeholder="Search current folder"
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
					{searchStatus}
				</Space>
			) : (
				<Space direction="vertical" size="small" style={{ width: '100%' }}>
					{searchScopeRow}
					<Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
						<Space wrap>
							<Input
								allowClear
								placeholder="Search current folder"
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
