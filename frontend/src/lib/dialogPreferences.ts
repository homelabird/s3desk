import { serverScopedStorageKey } from './profileScopedStorage'

const STORAGE_KEY = 'dismissedDialogPreferences'
const SCOPED_NAMESPACE = 'dialogPreference'

type DialogPreferences = Record<string, { dismissedAt: string }>

const listeners = new Set<() => void>()

const notify = () => {
	for (const listener of listeners) listener()
}

const readPreferences = (): DialogPreferences => {
	if (typeof window === 'undefined') return {}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return {}
		const parsed: unknown = JSON.parse(raw)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
		return parsed as DialogPreferences
	} catch {
		return {}
	}
}

const writePreferences = (next: DialogPreferences) => {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
	} catch {
		return
	}
	notify()
}

export function resolveDialogPreferenceScopeApiToken(apiToken?: string | null): string | null {
	if (typeof apiToken === 'string') return apiToken
	if (apiToken === null) return null
	if (typeof window === 'undefined') return null
	try {
		const sessionRaw = window.sessionStorage.getItem('apiToken')
		if (sessionRaw !== null) {
			const parsed = JSON.parse(sessionRaw)
			if (typeof parsed === 'string' && parsed.trim()) {
				return parsed
			}
		}
		const legacyRaw = window.localStorage.getItem('apiToken')
		if (legacyRaw !== null) {
			const parsed = JSON.parse(legacyRaw)
			if (typeof parsed === 'string' && parsed.trim()) {
				return parsed
			}
		}
	} catch {
		return null
	}
	return null
}

function buildScopedPreferenceStorageKey(key: string, apiToken?: string | null): string {
	return serverScopedStorageKey(SCOPED_NAMESPACE, resolveDialogPreferenceScopeApiToken(apiToken), key.trim())
}

function isScopedPreferenceStorageKey(key: string): boolean {
	return key.startsWith(`${SCOPED_NAMESPACE}:`)
}

function buildScopedPreferenceStoragePrefix(apiToken?: string | null): string {
	const normalizedScope = resolveDialogPreferenceScopeApiToken(apiToken)?.trim() || '__no_server__'
	return `${SCOPED_NAMESPACE}:${normalizedScope}:`
}

export const buildDialogPreferenceKey = (scope: string, id: string): string => `${scope}:${id.trim()}`

export const isDialogDismissed = (key: string, apiToken?: string | null): boolean => {
	const trimmedKey = key.trim()
	if (!trimmedKey) return false
	const current = readPreferences()
	const scopedKey = buildScopedPreferenceStorageKey(trimmedKey, apiToken)
	return !!current[scopedKey] || !!current[trimmedKey]
}

export const setDialogDismissed = (key: string, dismissed: boolean, apiToken?: string | null) => {
	const trimmedKey = key.trim()
	if (!trimmedKey) return
	const current = readPreferences()
	const scopedKey = buildScopedPreferenceStorageKey(trimmedKey, apiToken)
	if (dismissed) {
		const next = {
			...current,
			[scopedKey]: { dismissedAt: new Date().toISOString() },
		}
		delete next[trimmedKey]
		writePreferences({
			...next,
		})
		return
	}
	if (!(trimmedKey in current) && !(scopedKey in current)) return
	const next = { ...current }
	delete next[trimmedKey]
	delete next[scopedKey]
	writePreferences(next)
}

export const countDismissedDialogs = (apiToken?: string | null): number => {
	const scopedPrefix = buildScopedPreferenceStoragePrefix(apiToken)
	return Object.keys(readPreferences()).filter((key) => key.startsWith(scopedPrefix) || !isScopedPreferenceStorageKey(key)).length
}

export const clearDismissedDialogs = (apiToken?: string | null) => {
	const scopedPrefix = buildScopedPreferenceStoragePrefix(apiToken)
	const current = readPreferences()
	let changed = false
	const next: DialogPreferences = {}
	for (const [key, value] of Object.entries(current)) {
		if (key.startsWith(scopedPrefix) || !isScopedPreferenceStorageKey(key)) {
			changed = true
			continue
		}
		next[key] = value
	}
	if (!changed) return
	if (typeof window === 'undefined') return
	try {
		if (Object.keys(next).length === 0) {
			window.localStorage.removeItem(STORAGE_KEY)
		} else {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
		}
	} catch {
		return
	}
	notify()
}

export const subscribeDialogPreferences = (listener: () => void) => {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
