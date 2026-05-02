import { CheckCircleFilled } from '@ant-design/icons'

import styles from './ObjectsBucketPicker.module.css'
import {
	normalizeBucketPickerTestIdPart,
	type BucketPickerEntry,
	type BucketPickerEntryGroups,
} from './objectsBucketPickerModel'

type ObjectsBucketPickerEntryListProps = BucketPickerEntryGroups & {
	variant: 'desktop' | 'mobile'
	emptyMessage: string
	onSelect: (value: string) => void
}

function ObjectsBucketPickerEntryContent({
	entry,
	variant,
}: {
	entry: BucketPickerEntry
	variant: 'desktop' | 'mobile'
}) {
	return (
		<div className={variant === 'desktop' ? styles.bucketPickerOption : styles.bucketPickerRowContent}>
			<div className={styles.bucketPickerOptionText}>
				<span className={`${styles.bucketPickerEntryLabel} ${entry.isCurrent ? styles.bucketPickerEntryLabelCurrent : ''}`}>
					{entry.label}
				</span>
				<div className={styles.bucketPickerBadgeRow}>
					{entry.isCurrent ? <span className={`${styles.bucketPickerBadge} ${styles.bucketPickerBadgeCurrent}`}>Current</span> : null}
					{entry.isRecent ? <span className={`${styles.bucketPickerBadge} ${styles.bucketPickerBadgeRecent}`}>Recent</span> : null}
				</div>
			</div>
			{entry.isCurrent && variant === 'mobile' ? <CheckCircleFilled className={styles.bucketPickerCurrentIcon} /> : null}
		</div>
	)
}

export function ObjectsBucketPickerEntryList({
	allEntries,
	currentEntry,
	emptyMessage,
	onSelect,
	recentEntries,
	variant,
}: ObjectsBucketPickerEntryListProps) {
	const renderButton = (entry: BucketPickerEntry, sectionKey: string, current = false) => (
		<button
			key={`${sectionKey}-${entry.value}`}
			type="button"
			className={`${styles.bucketPickerRow} ${current ? styles.bucketPickerRowCurrent : ''}`}
			onClick={() => onSelect(entry.value)}
			data-testid={`objects-bucket-picker-option-${normalizeBucketPickerTestIdPart(entry.value)}`}
		>
			<ObjectsBucketPickerEntryContent entry={entry} variant={variant} />
		</button>
	)

	if (!currentEntry && recentEntries.length === 0 && allEntries.length === 0) {
		return <div className={styles.bucketPickerEmpty}>{emptyMessage}</div>
	}

	return (
		<>
			{currentEntry ? (
				<div className={styles.bucketPickerSection}>
					<div className={styles.bucketPickerSectionLabel}>Current</div>
					{renderButton(currentEntry, 'current', true)}
				</div>
			) : null}

			{recentEntries.length > 0 ? (
				<div className={styles.bucketPickerSection}>
					<div className={styles.bucketPickerSectionLabel}>Recent</div>
					<div className={styles.bucketPickerList}>{recentEntries.map((entry) => renderButton(entry, 'recent'))}</div>
				</div>
			) : null}

			{allEntries.length > 0 ? (
				<div className={styles.bucketPickerSection}>
					<div className={styles.bucketPickerSectionLabel}>All buckets</div>
					<div className={styles.bucketPickerList}>{allEntries.map((entry) => renderButton(entry, 'all'))}</div>
				</div>
			) : null}
		</>
	)
}
