import { Badge, Input, Space, Switch, Typography } from 'antd'
import { SearchOutlined, StarFilled } from '@ant-design/icons'

import type { FavoriteObjectItem } from '../../api/types'
import styles from './objects.module.css'
import { ObjectsTreePane } from './ObjectsTreePane'

type ObjectsFavoritesPaneProps = {
	hasProfile: boolean
	hasBucket: boolean
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
	const query = props.query.trim().toLowerCase()
	const filtered = query ? availableFavorites.filter((item) => item.key.toLowerCase().includes(query)) : availableFavorites
	const sorted = [...filtered].sort((a, b) => a.key.localeCompare(b.key))

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
			extra={
				<Badge
					count={availableFavorites.length}
					overflowCount={999}
					showZero
					style={{ backgroundColor: availableFavorites.length > 0 ? 'var(--s3d-color-primary)' : 'var(--s3d-color-border-strong)' }}
				/>
			}
		>
			<div className={styles.favoritesPane}>
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
				<Space size="small" wrap>
					<Space size={6} align="center">
						<Switch
							size="small"
							checked={props.favoritesOnly}
							onChange={props.onFavoritesOnlyChange}
							disabled={disabled}
							aria-label="Favorites only"
						/>
						<Typography.Text type="secondary">Favorites only</Typography.Text>
					</Space>
					<Space size={6} align="center">
						<Switch
							size="small"
							checked={props.openDetailsOnClick}
							onChange={props.onOpenDetailsOnClickChange}
							disabled={disabled}
							aria-label="Open details on click"
						/>
						<Typography.Text type="secondary">Open details on click</Typography.Text>
					</Space>
				</Space>
				<div className={styles.favoritesList}>
					{sorted.map((item) => {
						const { name, path } = splitFavoriteKey(item.key)
						return (
							<button
								key={item.key}
								type="button"
								className={styles.favoritesItem}
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
					{emptyMessage ? <Typography.Text type={emptyMessageType}>{emptyMessage}</Typography.Text> : null}
				</div>
			</div>
		</ObjectsTreePane>
	)
}
