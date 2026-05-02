function normalizeStorageScope(value: string | null | undefined, fallback: string): string {
	return value?.trim() || fallback
}

function storageScopeHash(value: string): string {
	let hash = 2166136261
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 16777619)
	}
	return (hash >>> 0).toString(36).padStart(7, '0')
}

function storageOriginScope(): string {
	if (typeof window === 'undefined') return '__server__'
	return normalizeStorageScope(window.location.origin, '__server__')
}

export function serverStorageScopeForOrigin(origin: string | null | undefined, apiToken: string | null | undefined): string {
	const token = apiToken?.trim()
	const tokenScope = token ? `token_${storageScopeHash(token)}` : 'token_none'
	return `${normalizeStorageScope(origin, '__server__')}:${tokenScope}`
}

export function serverStorageScope(apiToken: string | null | undefined): string {
	return serverStorageScopeForOrigin(storageOriginScope(), apiToken)
}

function parseStoredString(raw: string | null): string | null {
	if (raw === null) return null
	try {
		const parsed = JSON.parse(raw)
		return typeof parsed === 'string' ? parsed : null
	} catch {
		return null
	}
}

function readLegacyStoredApiToken(): string | null {
	if (typeof window === 'undefined') return null
	return (
		parseStoredString(window.localStorage.getItem('apiToken')) ??
		parseStoredString(window.sessionStorage.getItem('apiToken'))
	)
}

export function serverScopedStorageKey(
	namespace: string,
	apiToken: string | null | undefined,
	name: string,
): string {
	return serverScopedStorageKeyForOrigin(namespace, storageOriginScope(), apiToken, name)
}

export function serverScopedStorageKeyForOrigin(
	namespace: string,
	origin: string | null | undefined,
	apiToken: string | null | undefined,
	name: string,
): string {
	const serverScope = serverStorageScopeForOrigin(origin, apiToken)
	return `${namespace}:${serverScope}:${name}`
}

export function legacyServerScopedStorageKey(
	namespace: string,
	apiToken: string | null | undefined,
	name: string,
): string {
	const serverScope = normalizeStorageScope(apiToken, '__no_server__')
	return `${namespace}:${serverScope}:${name}`
}

export function profileScopedStorageKey(
	namespace: string,
	apiToken: string | null | undefined,
	profileId: string | null | undefined,
	name: string,
): string {
	return profileScopedStorageKeyForOrigin(namespace, storageOriginScope(), apiToken, profileId, name)
}

export function profileScopedStorageKeyForOrigin(
	namespace: string,
	origin: string | null | undefined,
	apiToken: string | null | undefined,
	profileId: string | null | undefined,
	name: string,
): string {
	const serverScope = serverStorageScopeForOrigin(origin, apiToken)
	const profileScope = normalizeStorageScope(profileId, '__no_profile__')
	return `${namespace}:${serverScope}:${profileScope}:${name}`
}

export function legacyProfileScopedStorageKey(
	namespace: string,
	profileId: string | null | undefined,
	name: string,
): string {
	const profileScope = normalizeStorageScope(profileId, '__no_profile__')
	return `${namespace}:${profileScope}:${name}`
}

export function legacyTokenProfileScopedStorageKey(
	namespace: string,
	apiToken: string | null | undefined,
	profileId: string | null | undefined,
	name: string,
): string {
	const serverScope = normalizeStorageScope(apiToken, '__no_server__')
	const profileScope = normalizeStorageScope(profileId, '__no_profile__')
	return `${namespace}:${serverScope}:${profileScope}:${name}`
}

export function legacyProfileScopedStorageKeys(
	namespace: string,
	apiToken: string | null | undefined,
	profileId: string | null | undefined,
	name: string,
): string[] {
	return [
		legacyTokenProfileScopedStorageKey(namespace, apiToken, profileId, name),
		legacyProfileScopedStorageKey(namespace, profileId, name),
	]
}

function readLegacyServerScopedStoredString(
	namespace: string,
	apiToken: string | null | undefined,
	name: string,
): string | null {
	if (typeof window === 'undefined') return null
	return parseStoredString(window.localStorage.getItem(legacyServerScopedStorageKey(namespace, apiToken, name)))
}

export function shouldUseLegacyActiveProfileStorageMigration(apiToken: string | null | undefined): boolean {
	if (typeof window === 'undefined') return false
	try {
		const legacyProfileId = parseStoredString(window.localStorage.getItem('profileId'))
		if (!legacyProfileId?.trim()) return false
		const currentServerScope = serverStorageScope(apiToken)
		const legacyServerScope = serverStorageScope(readLegacyStoredApiToken())
		return currentServerScope === legacyServerScope
	} catch {
		return false
	}
}

export function readLegacyActiveProfileIdForMigration(apiToken: string | null | undefined): string | null {
	if (typeof window === 'undefined') return null
	const legacyScopedProfileId = readLegacyServerScopedStoredString('app', apiToken, 'profileId')
	if (legacyScopedProfileId?.trim()) return legacyScopedProfileId
	if (!shouldUseLegacyActiveProfileStorageMigration(apiToken)) return null
	const legacyProfileId = parseStoredString(window.localStorage.getItem('profileId'))
	return legacyProfileId?.trim() ? legacyProfileId : null
}
