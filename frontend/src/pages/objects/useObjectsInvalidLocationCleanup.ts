import { useCallback } from 'react'

import type { LocationTab } from './objectsPageConstants'

type StateSetter<T> = (next: T | ((prev: T) => T)) => void

type UseObjectsInvalidLocationCleanupArgs = {
	bucket: string
	setBucket: StateSetter<string>
	setPrefix: StateSetter<string>
	setTabs: StateSetter<LocationTab[]>
	setRecentBuckets: StateSetter<string[]>
	setRecentPrefixesByBucket: StateSetter<Record<string, string[]>>
	setBookmarksByBucket: StateSetter<Record<string, string[]>>
	setPrefixByBucket: StateSetter<Record<string, string>>
	closePathModal: (nextDraft?: string) => void
}

function removeRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
	if (!(key in record)) return record
	const next = { ...record }
	delete next[key]
	return next
}

function clearBucketFromTab(tab: LocationTab, invalidBucket: string): LocationTab {
	if (tab.bucket !== invalidBucket && !tab.history.some((entry) => entry.bucket === invalidBucket)) {
		return tab
	}
	const nextHistory = tab.history.map((entry) =>
		entry.bucket === invalidBucket ? { bucket: '', prefix: '' } : entry,
	)
	const nextCurrent =
		tab.bucket === invalidBucket
			? { bucket: '', prefix: '' }
			: { bucket: tab.bucket, prefix: tab.prefix }
	return {
		...tab,
		bucket: nextCurrent.bucket,
		prefix: nextCurrent.prefix,
		history: nextHistory,
		historyIndex: Math.min(tab.historyIndex, Math.max(0, nextHistory.length - 1)),
	}
}

export function useObjectsInvalidLocationCleanup({
	bucket,
	setBucket,
	setPrefix,
	setTabs,
	setRecentBuckets,
	setRecentPrefixesByBucket,
	setBookmarksByBucket,
	setPrefixByBucket,
	closePathModal,
}: UseObjectsInvalidLocationCleanupArgs) {
	return useCallback(
		(invalidBucketRaw?: string) => {
			const invalidBucket = (invalidBucketRaw ?? bucket).trim()
			if (!invalidBucket) return

			setTabs((prev) => prev.map((tab) => clearBucketFromTab(tab, invalidBucket)))
			setRecentBuckets((prev) => prev.filter((entry) => entry !== invalidBucket))
			setRecentPrefixesByBucket((prev) => removeRecordKey(prev, invalidBucket))
			setBookmarksByBucket((prev) => removeRecordKey(prev, invalidBucket))
			setPrefixByBucket((prev) => removeRecordKey(prev, invalidBucket))
			if (bucket === invalidBucket) {
				setBucket('')
				setPrefix('')
				closePathModal('')
			}
		},
		[
			bucket,
			closePathModal,
			setBookmarksByBucket,
			setBucket,
			setPrefix,
			setPrefixByBucket,
			setRecentBuckets,
			setRecentPrefixesByBucket,
			setTabs,
		],
	)
}
