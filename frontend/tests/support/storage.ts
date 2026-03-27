import type { Page } from '@playwright/test'

export async function seedLocalStorage(page: Page, values: Record<string, unknown>) {
	await page.addInitScript((entries) => {
		const profileId = typeof entries.profileId === 'string' ? entries.profileId.trim() : ''
		const storageScope = profileId || '__no_profile__'
		const bucket = typeof entries.bucket === 'string' ? entries.bucket.trim() : ''
		const prefix = typeof entries.prefix === 'string' ? entries.prefix : ''
		const setScopedObjectState = (name: string, value: unknown) => {
			if (value === undefined) return
			window.localStorage.setItem(`objects:${storageScope}:${name}`, JSON.stringify(value))
		}

		for (const [key, value] of Object.entries(entries)) {
			const serialized = JSON.stringify(value)
			window.localStorage.setItem(key, serialized)
			if (key === 'apiToken') {
				window.sessionStorage.setItem(key, serialized)
			}
		}

		if (bucket && entries.objectsTabs === undefined) {
			setScopedObjectState('tabs', [
				{
					id: 'seeded-tab',
					bucket,
					prefix,
					history: [{ bucket, prefix }],
					historyIndex: 0,
				},
			])
		}
		if (bucket && entries.objectsActiveTabId === undefined) {
			setScopedObjectState('activeTabId', 'seeded-tab')
		}
		if (bucket && entries.objectsRecentBuckets === undefined) {
			setScopedObjectState('recentBuckets', [bucket])
		}
		if (bucket && entries.objectsPrefixByBucket === undefined) {
			setScopedObjectState('prefixByBucket', { [bucket]: prefix })
		}
		if (bucket && entries.objectsRecentPrefixesByBucket === undefined) {
			setScopedObjectState('recentPrefixesByBucket', { [bucket]: [prefix || '/'] })
		}

		setScopedObjectState('bucket', entries.bucket)
		setScopedObjectState('prefix', entries.prefix)
		setScopedObjectState('recentBuckets', entries.objectsRecentBuckets)
		setScopedObjectState('recentPrefixesByBucket', entries.objectsRecentPrefixesByBucket)
		setScopedObjectState('bookmarksByBucket', entries.objectsBookmarksByBucket)
		setScopedObjectState('prefixByBucket', entries.objectsPrefixByBucket)
		setScopedObjectState('tabs', entries.objectsTabs)
		setScopedObjectState('activeTabId', entries.objectsActiveTabId)
	}, values)
}
