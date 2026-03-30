function normalizeStorageScope(value: string | null | undefined, fallback: string): string {
	return value?.trim() || fallback
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
	const serverScope = normalizeStorageScope(apiToken, '__no_server__')
	return `${namespace}:${serverScope}:${name}`
}

export function profileScopedStorageKey(
	namespace: string,
	apiToken: string | null | undefined,
	profileId: string | null | undefined,
	name: string,
): string {
	const serverScope = normalizeStorageScope(apiToken, '__no_server__')
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

export function shouldUseLegacyActiveProfileStorageMigration(apiToken: string | null | undefined): boolean {
	if (typeof window === 'undefined') return false
	try {
		const legacyProfileId = parseStoredString(window.localStorage.getItem('profileId'))
		if (!legacyProfileId?.trim()) return false
		const currentServerScope = normalizeStorageScope(apiToken, '__no_server__')
		const legacyServerScope = normalizeStorageScope(readLegacyStoredApiToken(), '__no_server__')
		return currentServerScope === legacyServerScope
	} catch {
		return false
	}
}

export function readLegacyActiveProfileIdForMigration(apiToken: string | null | undefined): string | null {
	if (typeof window === 'undefined') return null
	if (!shouldUseLegacyActiveProfileStorageMigration(apiToken)) return null
	const legacyProfileId = parseStoredString(window.localStorage.getItem('profileId'))
	return legacyProfileId?.trim() ? legacyProfileId : null
}
