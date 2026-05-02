import { useCallback, useEffect, useRef } from 'react'

import { legacyProfileScopedStorageKeys, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import type { LocationTab } from './objectsPageConstants'

type UseObjectsLocationPersistenceParams = {
	apiToken: string
	profileId: string | null
}

export function useObjectsLocationPersistence({
	apiToken,
	profileId,
}: UseObjectsLocationPersistenceParams) {
	const storageKey = useCallback(
		(name: string) => profileScopedStorageKey('objects', apiToken, profileId, name),
		[apiToken, profileId],
	)
	const legacyStorageKey = useCallback(
		(name: string) => legacyProfileScopedStorageKeys('objects', apiToken, profileId, name),
		[apiToken, profileId],
	)

	const [bucket, setBucket] = useLocalStorageState<string>(storageKey('bucket'), '', {
		legacyLocalStorageKeys: legacyStorageKey('bucket'),
	})
	const [prefix, setPrefix] = useLocalStorageState<string>(storageKey('prefix'), '', {
		legacyLocalStorageKeys: legacyStorageKey('prefix'),
	})
	const [tabs, setTabs] = useLocalStorageState<LocationTab[]>(storageKey('tabs'), [], {
		legacyLocalStorageKeys: legacyStorageKey('tabs'),
	})
	const [activeTabId, setActiveTabId] = useLocalStorageState<string>(storageKey('activeTabId'), '', {
		legacyLocalStorageKeys: legacyStorageKey('activeTabId'),
	})
	const [recentBuckets, setRecentBuckets] = useLocalStorageState<string[]>(storageKey('recentBuckets'), [], {
		legacyLocalStorageKeys: legacyStorageKey('recentBuckets'),
	})
	const [recentPrefixesByBucket, setRecentPrefixesByBucket] = useLocalStorageState<Record<string, string[]>>(
		storageKey('recentPrefixesByBucket'),
		{},
		{ legacyLocalStorageKeys: legacyStorageKey('recentPrefixesByBucket') },
	)
	const [bookmarksByBucket, setBookmarksByBucket] = useLocalStorageState<Record<string, string[]>>(
		storageKey('bookmarksByBucket'),
		{},
		{ legacyLocalStorageKeys: legacyStorageKey('bookmarksByBucket') },
	)
	const [prefixByBucket, setPrefixByBucket] = useLocalStorageState<Record<string, string>>(storageKey('prefixByBucket'), {}, {
		legacyLocalStorageKeys: legacyStorageKey('prefixByBucket'),
	})
	const prefixByBucketRef = useRef<Record<string, string>>(prefixByBucket)

	useEffect(() => {
		prefixByBucketRef.current = prefixByBucket
	}, [prefixByBucket])

	useEffect(() => {
		if (!bucket) return
		setPrefixByBucket((prev) => ({ ...prev, [bucket]: prefix }))
	}, [bucket, prefix, setPrefixByBucket])

	useEffect(() => {
		if (!bucket) return
		setRecentBuckets((prev) => [bucket, ...prev.filter((entry) => entry !== bucket)].slice(0, 12))
	}, [bucket, setRecentBuckets])

	return {
		activeTabId,
		bookmarksByBucket,
		bucket,
		prefix,
		prefixByBucketRef,
		recentBuckets,
		recentPrefixesByBucket,
		setActiveTabId,
		setBookmarksByBucket,
		setBucket,
		setPrefix,
		setPrefixByBucket,
		setRecentBuckets,
		setRecentPrefixesByBucket,
		setTabs,
		tabs,
	}
}
