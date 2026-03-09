import type { Page } from '@playwright/test'

export async function seedLocalStorage(page: Page, values: Record<string, unknown>) {
	await page.addInitScript((entries) => {
		const profileId = typeof entries.profileId === 'string' ? entries.profileId.trim() : ''
		const storageScope = profileId || '__no_profile__'
		const setScopedObjectState = (name: string, value: unknown) => {
			if (value === undefined) return
			window.localStorage.setItem(`objects:${storageScope}:${name}`, JSON.stringify(value))
		}

		for (const [key, value] of Object.entries(entries)) {
			window.localStorage.setItem(key, JSON.stringify(value))
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
