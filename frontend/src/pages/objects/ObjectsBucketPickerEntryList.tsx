import { CheckCircleFilled } from '@ant-design/icons'
import { useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

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
	const allListRef = useRef<HTMLDivElement | null>(null)
	const allVirtualizer = useVirtualizer({
		count: allEntries.length,
		getScrollElement: () => allListRef.current,
		estimateSize: () => 68,
		overscan: 5,
	})
	const measuredItems = allVirtualizer.getVirtualItems()
	const allVirtualItems = useMemo(
		() =>
			measuredItems.length > 0
				? measuredItems
				: allEntries.slice(0, 20).map((_, index) => ({
						index,
						key: index,
						start: index * 68,
						size: 68,
						end: (index + 1) * 68,
						lane: 0,
					})),
		[allEntries, measuredItems],
	)
	const allTotalSize = measuredItems.length > 0 ? allVirtualizer.getTotalSize() : allEntries.length * 68

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
				<div className={`${styles.bucketPickerSection} ${styles.bucketPickerSectionCurrent}`}>
					<div className={styles.bucketPickerSectionHeader}>
						<div className={styles.bucketPickerSectionLabel}>Current</div>
						<div className={styles.bucketPickerSectionHint}>The bucket this workspace is using now</div>
					</div>
					{renderButton(currentEntry, 'current', true)}
				</div>
			) : null}

			{recentEntries.length > 0 ? (
				<div className={styles.bucketPickerSection}>
					<div className={styles.bucketPickerSectionHeader}>
						<div className={styles.bucketPickerSectionLabel}>Recent</div>
						<div className={styles.bucketPickerSectionHint}>Buckets opened recently for faster switching</div>
					</div>
					<div className={styles.bucketPickerList}>{recentEntries.map((entry) => renderButton(entry, 'recent'))}</div>
				</div>
			) : null}

			{allEntries.length > 0 ? (
				<div className={styles.bucketPickerSection}>
					<div className={styles.bucketPickerSectionHeader}>
						<div className={styles.bucketPickerSectionLabel}>All buckets</div>
						<div className={styles.bucketPickerSectionHint}>Browse the full bucket list</div>
					</div>
					<div ref={allListRef} className={`${styles.bucketPickerList} ${styles.bucketPickerVirtualList}`} role="list">
						<div className={styles.bucketPickerVirtualContent} style={{ height: allTotalSize }}>
							{allVirtualItems.map((item) => {
								const entry = allEntries[item.index]
								if (!entry) return null
								return (
									<div
										key={entry.value}
										ref={allVirtualizer.measureElement}
										data-index={item.index}
										className={styles.bucketPickerVirtualRow}
										style={{ transform: `translateY(${item.start}px)` }}
										role="listitem"
										aria-posinset={item.index + 1}
										aria-setsize={allEntries.length}
									>
										{renderButton(entry, 'all')}
									</div>
								)
							})}
						</div>
					</div>
				</div>
			) : null}
		</>
	)
}
