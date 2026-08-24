import { Collapse, Select, Space, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import { NumberField } from '../../components/NumberField'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import {
	OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MIN_HOURS,
} from '../../lib/objectIndexing'
import {
	OBJECTS_COST_MODE_DEFAULT,
	OBJECTS_COST_MODE_STORAGE_KEY,
	type ObjectsCostMode,
} from '../../lib/objectsCostMode'
import {
	THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	THUMBNAIL_CACHE_MAX_ENTRIES,
	THUMBNAIL_CACHE_MIN_ENTRIES,
} from '../../lib/thumbnailCache'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import styles from '../SettingsPage.module.css'

export function ObjectsSettingsSection() {
	const [objectsShowThumbnails, setObjectsShowThumbnails] = useLocalStorageState<boolean>('objectsShowThumbnails', true)
	const [objectsThumbnailCacheSize, setObjectsThumbnailCacheSize] = useLocalStorageState<number>(
		'objectsThumbnailCacheSize',
		THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	)
	const [objectsCostMode, setObjectsCostMode] = useLocalStorageState<ObjectsCostMode>(
		OBJECTS_COST_MODE_STORAGE_KEY,
		OBJECTS_COST_MODE_DEFAULT,
	)
	const [objectsAutoIndexEnabled, setObjectsAutoIndexEnabled] = useLocalStorageState<boolean>(
		'objectsAutoIndexEnabled',
		OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
	)
	const [objectsAutoIndexTtlHours, setObjectsAutoIndexTtlHours] = useLocalStorageState<number>(
		'objectsAutoIndexTtlHours',
		OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
	)

	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			<Typography.Text type="secondary" className={styles.sectionIntro}>
				Saved immediately in this browser.
			</Typography.Text>
			<FormField label="Show image thumbnails" extra="Controls thumbnails in the object list and details panel.">
				<ToggleSwitch
					checked={objectsShowThumbnails}
					onChange={setObjectsShowThumbnails}
					ariaLabel="Show image thumbnails"
				/>
			</FormField>
			<FormField
				label="Object storage cost mode"
				htmlFor="settings-objects-cost-mode"
				extra="Conservative uses fewer requests; Aggressive prioritizes speed."
			>
				<Select
					id="settings-objects-cost-mode"
					aria-label="Object storage cost mode"
					value={objectsCostMode}
					onChange={(value) => setObjectsCostMode(value as ObjectsCostMode)}
					options={[
						{ value: 'conservative', label: 'Conservative' },
						{ value: 'balanced', label: 'Balanced' },
						{ value: 'aggressive', label: 'Aggressive' },
					]}
				/>
			</FormField>
			<Collapse
				size="small"
				items={[
					{
						key: 'advanced',
						label: 'Cache and indexing',
						children: (
							<Space orientation="vertical" size="middle" className={styles.fullWidth}>
								<FormField
									label="Thumbnail cache size"
									htmlFor="settings-thumbnail-cache-size"
									extra="Max cached thumbnails kept in memory (LRU)."
								>
									<NumberField
										id="settings-thumbnail-cache-size"
										min={THUMBNAIL_CACHE_MIN_ENTRIES}
										max={THUMBNAIL_CACHE_MAX_ENTRIES}
										step={50}
										value={objectsThumbnailCacheSize}
										onChange={(value) =>
											setObjectsThumbnailCacheSize(
												typeof value === 'number'
													? Math.min(THUMBNAIL_CACHE_MAX_ENTRIES, Math.max(THUMBNAIL_CACHE_MIN_ENTRIES, value))
													: THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
											)
										}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Auto index current prefix"
									extra="When Search bucket is used, build/refresh the index for the current prefix automatically."
								>
									<ToggleSwitch
										checked={objectsAutoIndexEnabled}
										onChange={setObjectsAutoIndexEnabled}
										ariaLabel="Auto index current prefix"
									/>
								</FormField>
								<FormField
									label="Auto index TTL (hours)"
									htmlFor="settings-auto-index-ttl-hours"
									extra="Rebuild prefix index when it is older than this value."
								>
									<NumberField
										id="settings-auto-index-ttl-hours"
										min={OBJECTS_AUTO_INDEX_TTL_MIN_HOURS}
										max={OBJECTS_AUTO_INDEX_TTL_MAX_HOURS}
										step={1}
										value={objectsAutoIndexTtlHours}
										onChange={(value) =>
											setObjectsAutoIndexTtlHours(
												typeof value === 'number'
													? Math.min(OBJECTS_AUTO_INDEX_TTL_MAX_HOURS, Math.max(OBJECTS_AUTO_INDEX_TTL_MIN_HOURS, value))
													: OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
											)
										}
										disabled={!objectsAutoIndexEnabled}
										className={styles.fullWidth}
									/>
								</FormField>
							</Space>
						),
					},
				]}
			/>
		</Space>
	)
}
