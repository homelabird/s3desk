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
	getObjectsCostModeStorageKey,
	type ObjectsCostMode,
} from '../../lib/objectsCostMode'
import {
	THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	THUMBNAIL_CACHE_MAX_ENTRIES,
	THUMBNAIL_CACHE_MIN_ENTRIES,
} from '../../lib/thumbnailCache'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { profileScopedStorageKey } from '../../lib/profileScopedStorage'
import styles from '../SettingsPage.module.css'

export function ObjectsSettingsSection(props: { apiToken: string; profileId: string | null; profileName: string | null }) {
	const [objectsShowThumbnails, setObjectsShowThumbnails] = useLocalStorageState<boolean>('objectsShowThumbnails', true)
	const [objectsThumbnailCacheSize, setObjectsThumbnailCacheSize] = useLocalStorageState<number>(
		'objectsThumbnailCacheSize',
		THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	)
	const costModeStorageKey = getObjectsCostModeStorageKey(props.apiToken, props.profileId)
	const [objectsCostMode, setObjectsCostMode] = useLocalStorageState<ObjectsCostMode>(costModeStorageKey, OBJECTS_COST_MODE_DEFAULT, {
		...(props.profileId ? { legacyLocalStorageKey: OBJECTS_COST_MODE_STORAGE_KEY } : {}),
	})
	const [objectsAutoIndexEnabled, setObjectsAutoIndexEnabled] = useLocalStorageState<boolean>(
		props.profileId ? profileScopedStorageKey('objects', props.apiToken, props.profileId, 'autoIndexEnabled') : 'objectsAutoIndexEnabled',
		OBJECTS_AUTO_INDEX_DEFAULT_ENABLED,
		props.profileId ? { legacyLocalStorageKey: 'objectsAutoIndexEnabled' } : {},
	)
	const [objectsAutoIndexTtlHours, setObjectsAutoIndexTtlHours] = useLocalStorageState<number>(
		props.profileId ? profileScopedStorageKey('objects', props.apiToken, props.profileId, 'autoIndexTtlHours') : 'objectsAutoIndexTtlHours',
		OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
		props.profileId ? { legacyLocalStorageKey: 'objectsAutoIndexTtlHours' } : {},
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
				extra={`${props.profileId ? `Saved for ${props.profileName || 'the selected profile'}.` : 'Select a profile to save a separate preference.'} Conservative disables background prefetch; Aggressive is capped at two bucket pages.`}
			>
				<Select
					id="settings-objects-cost-mode"
					aria-label="Object storage cost mode"
					value={objectsCostMode}
					disabled={!props.profileId}
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
									extra="Refreshes an existing index for this profile when Search bucket is used. First-time scans always require clicking Build index."
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
