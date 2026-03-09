import { Badge, Input, Space, Typography } from 'antd'
import { SearchOutlined, StarFilled } from '@ant-design/icons'

import { ToggleSwitch } from '../../components/ToggleSwitch'
import type { FavoriteObjectItem } from '../../api/types'
import styles from './objects.module.css'
import { ObjectsTreePane } from './ObjectsTreePane'

type ObjectsFavoritesPaneProps = {
	hasProfile: boolean
	hasBucket: boolean
	favoriteCount: number
	isLoading: boolean
	errorMessage?: string | null
	favorites: FavoriteObjectItem[]
	favoritesOnly: boolean
	onFavoritesOnlyChange: (value: boolean) => void
	openDetailsOnClick: boolean
	onOpenDetailsOnClickChange: (value: boolean) => void
	query: string
	onQueryChange: (value: string) => void
	onSelectFavorite: (key: string) => void
	expanded?: boolean
	onExpandedChange?: (expanded: boolean) => void
}

function splitFavoriteKey(key: string): { name: string; path: string } {
	const trimmed = key.replace(/\/+$/, '')
	if (!trimmed) return { name: key, path: '' }
	const parts = trimmed.split('/').filter(Boolean)
	if (parts.length === 0) return { name: key, path: '' }
	const name = parts.pop() ?? key
	const path = parts.length ? `${parts.join('/')}/` : ''
	return { name, path }
}

export function ObjectsFavoritesPane(props: ObjectsFavoritesPaneProps) {
	const disabled = !props.hasProfile || !props.hasBucket
	const availableFavorites = disabled ? [] : props.favorites
	const favoriteCount = disabled ? 0 : props.favoriteCount
	const query = props.query.trim().toLowerCase()
	const filtered = query ? availableFavorites.filter((item) => item.key.toLowerCase().includes(query)) : availableFavorites
	const sorted = [...filtered].sort((a, b) => a.key.localeCompare(b.key))
	const hasFavorites = favoriteCount > 0
	const showSearch = hasFavorites || query.length > 0
	const showBehaviorControls = hasFavorites || props.favoritesOnly

	let emptyMessage: string | null = null
	if (!props.hasProfile) emptyMessage = 'Select a profile to view favorites.'
	else if (!props.hasBucket) emptyMessage = 'Select a bucket to view favorites.'
	else if (props.errorMessage) emptyMessage = `Failed to load favorites: ${props.errorMessage}`
	else if (props.isLoading && availableFavorites.length === 0) emptyMessage = 'Loading favorites…'
	else if (availableFavorites.length === 0) emptyMessage = 'No favorites yet.'
	else if (sorted.length === 0) emptyMessage = 'No favorites match your search.'

	const emptyMessageType = props.errorMessage ? 'danger' : 'secondary'

	return (
		<ObjectsTreePane
			title="Favorites"
			testId="objects-favorites-pane"
			collapsible
			expanded={props.expanded}
			onExpandedChange={props.onExpandedChange}
			extra={
				<Badge
					count={favoriteCount}
					overflowCount={999}
					showZero
					style={{ backgroundColor: favoriteCount > 0 ? 'var(--s3d-color-primary)' : 'var(--s3d-color-border-strong)' }}
				/>
			}
		>
			<div className={styles.favoritesPane}>
				{showSearch ? (
					<Input
						allowClear
						size="small"
						placeholder="Find favorite…"
						aria-label="Find favorite"
						prefix={<SearchOutlined />}
						value={props.query}
						onChange={(e) => props.onQueryChange(e.target.value)}
						disabled={disabled}
					/>
				) : null}
				{showBehaviorControls ? (
					<Space size="small" wrap>
						<Space size={6} align="center">
							<ToggleSwitch
								checked={props.favoritesOnly}
								onChange={props.onFavoritesOnlyChange}
								disabled={disabled}
								ariaLabel="Favorites only"
							/>
							<Typography.Text type="secondary">Favorites only</Typography.Text>
						</Space>
						<Space size={6} align="center">
							<ToggleSwitch
								checked={props.openDetailsOnClick}
								onChange={props.onOpenDetailsOnClickChange}
								disabled={disabled}
								ariaLabel="Open details on click"
							/>
							<Typography.Text type="secondary">Open details on click</Typography.Text>
						</Space>
					</Space>
				) : null}
				<div className={styles.favoritesList}>
					{sorted.map((item) => {
						const { name, path } = splitFavoriteKey(item.key)
						return (
							<button
								key={item.key}
								type="button"
								className={styles.favoritesItem}
								data-testid="objects-favorite-item"
								data-favorite-key={item.key}
								onClick={() => props.onSelectFavorite(item.key)}
								disabled={disabled}
							>
								<div className={styles.favoritesItemTitle}>
									<StarFilled className={styles.favoritesStar} />
									<Typography.Text className={styles.favoritesItemName} title={name}>
										{name}
									</Typography.Text>
								</div>
								<Typography.Text className={styles.favoritesItemPath} title={item.key} type="secondary">
									{path || '/'}
								</Typography.Text>
							</button>
						)
					})}
					{emptyMessage ? (
						<div className={styles.favoritesEmptyState}>
							<Typography.Text type={emptyMessageType}>{emptyMessage}</Typography.Text>
							{props.hasProfile && props.hasBucket && !props.errorMessage && !props.isLoading && !hasFavorites ? (
								<Typography.Text type="secondary" className={styles.favoritesEmptyHint}>
									Star objects from the list to pin quick paths here.
								</Typography.Text>
							) : null}
						</div>
					) : null}
				</div>
			</div>
		</ObjectsTreePane>
	)
}
