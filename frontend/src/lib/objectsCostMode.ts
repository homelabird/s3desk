import { profileScopedStorageKey } from './profileScopedStorage'

export type ObjectsCostMode = 'aggressive' | 'balanced' | 'conservative'

export const OBJECTS_COST_MODE_STORAGE_KEY = 'objectsCostMode'
export const OBJECTS_COST_MODE_DEFAULT: ObjectsCostMode = 'conservative'

export function getObjectsCostModeStorageKey(apiToken: string, profileId: string | null): string {
	return profileId
		? profileScopedStorageKey('objects', apiToken, profileId, 'costMode')
		: OBJECTS_COST_MODE_STORAGE_KEY
}

type BucketPrefetchPlan = {
	initial: number
	dropdownPreferred: number
	dropdownFallback: number
}

export function normalizeObjectsCostMode(value: string | null | undefined): ObjectsCostMode {
	switch ((value ?? '').trim()) {
		case 'aggressive':
		case 'balanced':
		case 'conservative':
			return value as ObjectsCostMode
		default:
			return OBJECTS_COST_MODE_DEFAULT
	}
}

export function readStoredObjectsCostMode(apiToken?: string, profileId?: string | null): ObjectsCostMode {
	if (typeof window === 'undefined') return OBJECTS_COST_MODE_DEFAULT
	try {
		const profileKey = apiToken && profileId ? getObjectsCostModeStorageKey(apiToken, profileId) : null
		const stored = profileKey ? window.localStorage.getItem(profileKey) ?? window.localStorage.getItem(OBJECTS_COST_MODE_STORAGE_KEY) : window.localStorage.getItem(OBJECTS_COST_MODE_STORAGE_KEY)
		return normalizeObjectsCostMode(stored)
	} catch {
		return OBJECTS_COST_MODE_DEFAULT
	}
}

export function getBucketPrefetchPlan(mode: ObjectsCostMode): BucketPrefetchPlan {
	if (mode === 'conservative') {
		return {
			initial: 0,
			dropdownPreferred: 1,
			dropdownFallback: 0,
		}
	}

	return mode === 'aggressive'
		? { initial: 2, dropdownPreferred: 1, dropdownFallback: 0 }
		: { initial: 0, dropdownPreferred: 1, dropdownFallback: 0 }
}

export function getThumbnailRequestConcurrency(mode: ObjectsCostMode): number {
	switch (mode) {
		case 'aggressive':
			return 8
		case 'conservative':
			return 2
		case 'balanced':
		default:
			return 4
	}
}

export function shouldAutoIndexForCostMode(mode: ObjectsCostMode, prefix: string): boolean {
	if (mode === 'conservative') return false
	if (mode === 'balanced' && !prefix.trim()) return false
	return true
}
