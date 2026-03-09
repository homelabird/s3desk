import { Collapse, Space } from 'antd'

import { FormField } from '../../components/FormField'
import { NumberField } from '../../components/NumberField'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import {
	OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MAX_HOURS,
	OBJECTS_AUTO_INDEX_TTL_MIN_HOURS,
} from '../../lib/objectIndexing'
import {
	THUMBNAIL_CACHE_DEFAULT_MAX_ENTRIES,
	THUMBNAIL_CACHE_MAX_ENTRIES,
	THUMBNAIL_CACHE_MIN_ENTRIES,
} from '../../lib/thumbnailCache'
import styles from '../SettingsPage.module.css'

type ObjectsSettingsSectionProps = {
	objectsShowThumbnails: boolean
	setObjectsShowThumbnails: (v: boolean) => void
	objectsThumbnailCacheSize: number
	setObjectsThumbnailCacheSize: (v: number) => void
	objectsAutoIndexEnabled: boolean
	setObjectsAutoIndexEnabled: (v: boolean) => void
	objectsAutoIndexTtlHours: number
	setObjectsAutoIndexTtlHours: (v: number) => void
}

export function ObjectsSettingsSection(props: ObjectsSettingsSectionProps) {
	return (
		<div>
			<FormField label="Show image thumbnails" extra="Controls thumbnails in the object list and details panel.">
				<ToggleSwitch
					checked={props.objectsShowThumbnails}
					onChange={props.setObjectsShowThumbnails}
					aria-label="Show image thumbnails"
				/>
			</FormField>
			<Collapse
				size="small"
				items={[
					{
						key: 'advanced',
						label: 'Advanced',
						children: (
							<Space orientation="vertical" size="middle" className={styles.fullWidth}>
								<FormField label="Thumbnail cache size" extra="Max cached thumbnails kept in memory (LRU).">
									<NumberField
										min={THUMBNAIL_CACHE_MIN_ENTRIES}
										max={THUMBNAIL_CACHE_MAX_ENTRIES}
										step={50}
										value={props.objectsThumbnailCacheSize}
										onChange={(value) =>
											props.setObjectsThumbnailCacheSize(
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
									extra="When Global Search is used, build/refresh the index for the current prefix automatically."
								>
									<ToggleSwitch
										checked={props.objectsAutoIndexEnabled}
										onChange={props.setObjectsAutoIndexEnabled}
										aria-label="Auto index current prefix"
									/>
								</FormField>
								<FormField
									label="Auto index TTL (hours)"
									extra="Rebuild prefix index when it is older than this value."
								>
									<NumberField
										min={OBJECTS_AUTO_INDEX_TTL_MIN_HOURS}
										max={OBJECTS_AUTO_INDEX_TTL_MAX_HOURS}
										step={1}
										value={props.objectsAutoIndexTtlHours}
										onChange={(value) =>
											props.setObjectsAutoIndexTtlHours(
												typeof value === 'number'
													? Math.min(OBJECTS_AUTO_INDEX_TTL_MAX_HOURS, Math.max(OBJECTS_AUTO_INDEX_TTL_MIN_HOURS, value))
													: OBJECTS_AUTO_INDEX_DEFAULT_TTL_HOURS,
											)
										}
										disabled={!props.objectsAutoIndexEnabled}
										className={styles.fullWidth}
									/>
								</FormField>
							</Space>
						),
					},
				]}
			/>
		</div>
	)
}
