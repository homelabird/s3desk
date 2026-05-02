import { useCallback } from 'react'

import { buildObjectsLocationState } from './buildObjectsLocationState'
import { normalizePrefix } from './objectsListUtils'
import { useObjectsInvalidLocationCleanup } from './useObjectsInvalidLocationCleanup'
import { useObjectsLocationPersistence } from './useObjectsLocationPersistence'
import { useObjectsLocationTabs } from './useObjectsLocationTabs'
import { useObjectsPathBookmarks } from './useObjectsPathBookmarks'
import { useObjectsPathModalState } from './useObjectsPathModalState'

type UseObjectsLocationStateParams = {
	apiToken: string
	profileId: string | null
}

export function useObjectsLocationState({ apiToken, profileId }: UseObjectsLocationStateParams) {
	const persistence = useObjectsLocationPersistence({ apiToken, profileId })
	const { bucket, prefix } = persistence
	const normalizePathInput = useCallback((raw: string): string => {
		const cleaned = raw.trim().replace(/^\/+/, '')
		if (!cleaned || cleaned === '/') return ''
		return normalizePrefix(cleaned)
	}, [])

	const navigation = useObjectsLocationTabs({
		bucket,
		prefix,
		tabs: persistence.tabs,
		activeTabId: persistence.activeTabId,
		setBucket: persistence.setBucket,
		setPrefix: persistence.setPrefix,
		setTabs: persistence.setTabs,
		setActiveTabId: persistence.setActiveTabId,
		setRecentPrefixesByBucket: persistence.setRecentPrefixesByBucket,
		normalizePathInput,
	})
	const { navigateToLocation } = navigation

	const pathModal = useObjectsPathModalState({
		apiToken,
		profileId,
		bucket,
		prefix,
		navigateToLocation,
	})

	const bookmarks = useObjectsPathBookmarks({
		bucket,
		prefix,
		pathDraft: pathModal.pathDraft,
		bookmarksByBucket: persistence.bookmarksByBucket,
		recentPrefixesByBucket: persistence.recentPrefixesByBucket,
		setBookmarksByBucket: persistence.setBookmarksByBucket,
		normalizePathInput,
	})

	const canGoUp = !!bucket && !!prefix && prefix.includes('/')
	const onUp = useCallback(() => {
		if (!bucket) return
		const p = prefix.replace(/\/+$/, '')
		const idx = p.lastIndexOf('/')
		const next = idx === -1 ? '' : p.slice(0, idx + 1)
		navigateToLocation(bucket, next, { recordHistory: true })
	}, [bucket, navigateToLocation, prefix])

	const onOpenPrefix = useCallback(
		(nextPrefix: string) => {
			if (!bucket) return
			navigateToLocation(bucket, nextPrefix, { recordHistory: true })
		},
		[bucket, navigateToLocation],
	)

	const clearInvalidLocation = useObjectsInvalidLocationCleanup({
		bucket,
		setBucket: persistence.setBucket,
		setPrefix: persistence.setPrefix,
		setTabs: persistence.setTabs,
		setRecentBuckets: persistence.setRecentBuckets,
		setRecentPrefixesByBucket: persistence.setRecentPrefixesByBucket,
		setBookmarksByBucket: persistence.setBookmarksByBucket,
		setPrefixByBucket: persistence.setPrefixByBucket,
		closePathModal: pathModal.closePathModal,
	})

	return buildObjectsLocationState({
		bookmarks,
		canGoUp,
		clearInvalidLocation,
		navigation,
		onOpenPrefix,
		onUp,
		pathModal,
		persistence,
	})
}
