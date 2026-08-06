import type { Page } from '@playwright/test'

import {
	legacyTokenProfileScopedStorageKey,
	profileScopedStorageKeyForOrigin,
	serverScopedStorageKeyForOrigin,
} from '../../src/lib/profileScopedStorage'

type ScopedStorageArgs = {
	apiToken: string
	name: string
	namespace: string
	profileId?: string | null
}

async function getPageOrigin(page: Page) {
	const currentUrl = page.url()
	if (currentUrl && currentUrl !== 'about:blank') {
		return new URL(currentUrl).origin
	}
	return page.evaluate(() => window.location.origin)
}

async function readJsonLocalStorage<TValue>(page: Page, key: string, fallback: TValue): Promise<TValue> {
	return page.evaluate(
		({ fallback, key }) => {
			const raw = window.localStorage.getItem(key)
			if (raw === null) return fallback
			try {
				return JSON.parse(raw)
			} catch {
				return fallback
			}
		},
		{ fallback, key },
	)
}

export async function readServerScopedLocalStorage<TValue>(
	page: Page,
	args: Omit<ScopedStorageArgs, 'profileId'>,
	fallback: TValue,
): Promise<TValue> {
	const origin = await getPageOrigin(page)
	const key = serverScopedStorageKeyForOrigin(args.namespace, origin, args.apiToken, args.name)
	return readJsonLocalStorage(page, key, fallback)
}

export async function readProfileScopedLocalStorage<TValue>(
	page: Page,
	args: ScopedStorageArgs,
	fallback: TValue,
): Promise<TValue> {
	const origin = await getPageOrigin(page)
	const key = profileScopedStorageKeyForOrigin(args.namespace, origin, args.apiToken, args.profileId, args.name)
	return readJsonLocalStorage(page, key, fallback)
}

export async function seedLegacyTokenProfileScopedLocalStorage(
	page: Page,
	args: {
		apiToken: string
		namespace: string
		profileId: string | null
		values: Record<string, unknown>
	},
) {
	const entries = Object.entries(args.values).map(([name, value]) => [
		legacyTokenProfileScopedStorageKey(args.namespace, args.apiToken, args.profileId, name),
		value,
	] as const)
	await page.addInitScript((legacyEntries) => {
		for (const [key, value] of legacyEntries) {
			window.localStorage.setItem(key, JSON.stringify(value))
		}
	}, entries)
}

export async function seedLocalStorage(page: Page, values: Record<string, unknown>) {
	await page.addInitScript((entries) => {
		const normalizeStorageScope = (value: unknown, fallback: string) =>
			typeof value === 'string' && value.trim() ? value.trim() : fallback
		const storageScopeHash = (value: string) => {
			let hash = 2166136261
			for (let index = 0; index < value.length; index += 1) {
				hash ^= value.charCodeAt(index)
				hash = Math.imul(hash, 16777619)
			}
			return (hash >>> 0).toString(36).padStart(7, '0')
		}
		const serverStorageScope = (apiToken: unknown) => {
			const token = typeof apiToken === 'string' ? apiToken.trim() : ''
			const tokenScope = token ? `token_${storageScopeHash(token)}` : 'token_none'
			return `${window.location.origin}:${tokenScope}`
		}
		const activeApiToken = typeof entries.apiToken === 'string' ? entries.apiToken : ''
		const profileId = typeof entries.profileId === 'string' ? entries.profileId.trim() : ''
		const storageScope = profileId || '__no_profile__'
		const bucket = typeof entries.bucket === 'string' ? entries.bucket.trim() : ''
		const prefix = typeof entries.prefix === 'string' ? entries.prefix : ''
		// Keep scoped and legacy keys in sync so compatibility paths are covered.
		const setObjectStateForProfile = (targetProfileId: string, name: string, value: unknown, apiToken = activeApiToken) => {
			if (value === undefined) return
			const profileScope = normalizeStorageScope(targetProfileId, '__no_profile__')
			const serialized = JSON.stringify(value)
			window.localStorage.setItem(`objects:${serverStorageScope(apiToken)}:${profileScope}:${name}`, serialized)
			window.localStorage.setItem(`objects:${profileScope}:${name}`, serialized)
		}
		const setScopedObjectState = (name: string, value: unknown) =>
			setObjectStateForProfile(storageScope, name, value)

		for (const [key, value] of Object.entries(entries)) {
			const serialized = JSON.stringify(value)
			window.localStorage.setItem(key, serialized)
			if (key === 'apiToken') {
				window.sessionStorage.setItem(key, serialized)
			}
			const oldServerScopedObjectKey = key.match(/^objects:([^:]+):([^:]+):([^:]+)$/)
			if (oldServerScopedObjectKey) {
				const [, apiToken, objectProfileId, name] = oldServerScopedObjectKey
				setObjectStateForProfile(objectProfileId, name, value, apiToken)
			}
		}

		if (profileId) {
			const serializedProfileId = JSON.stringify(profileId)
			const serverProfileKey = `app:${serverStorageScope(activeApiToken)}:profileId`
			const legacyServerProfileKey = `app:${normalizeStorageScope(activeApiToken, '__no_server__')}:profileId`
			if (window.localStorage.getItem(serverProfileKey) === null) {
				window.localStorage.setItem(serverProfileKey, serializedProfileId)
			}
			if (window.localStorage.getItem(legacyServerProfileKey) === null) {
				window.localStorage.setItem(legacyServerProfileKey, serializedProfileId)
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
