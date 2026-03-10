export type ObjectsCostMode = 'aggressive' | 'balanced' | 'conservative'

export const OBJECTS_COST_MODE_STORAGE_KEY = 'objectsCostMode'
export const OBJECTS_COST_MODE_DEFAULT: ObjectsCostMode = 'balanced'

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

export function readStoredObjectsCostMode(): ObjectsCostMode {
	if (typeof window === 'undefined') return OBJECTS_COST_MODE_DEFAULT
	try {
		return normalizeObjectsCostMode(window.localStorage.getItem(OBJECTS_COST_MODE_STORAGE_KEY))
	} catch {
		return OBJECTS_COST_MODE_DEFAULT
	}
}

export function getBucketPrefetchPlan(
	mode: ObjectsCostMode,
	provider?: string | null,
): BucketPrefetchPlan {
	if (mode === 'conservative') {
		return {
			initial: 0,
			dropdownPreferred: 1,
			dropdownFallback: 0,
		}
	}

	if (provider === 'oci_object_storage' || provider === 'azure_blob' || provider === 's3_compatible') {
		return mode === 'aggressive'
			? { initial: 2, dropdownPreferred: 1, dropdownFallback: 0 }
			: { initial: 0, dropdownPreferred: 1, dropdownFallback: 0 }
	}

	return mode === 'aggressive'
		? { initial: 12, dropdownPreferred: 3, dropdownFallback: 3 }
		: { initial: 4, dropdownPreferred: 2, dropdownFallback: 1 }
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
