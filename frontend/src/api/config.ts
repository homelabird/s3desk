export const RETRY_COUNT_STORAGE_KEY = 'apiRetryCount'
export const RETRY_DELAY_STORAGE_KEY = 'apiRetryDelayMs'
export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_RETRY_COUNT = 2
export const DEFAULT_RETRY_DELAY_MS = 600
export const MAX_RETRY_DELAY_MS = 5000

export const RETRY_COUNT_MIN = 0
export const RETRY_COUNT_MAX = 5
export const RETRY_DELAY_MIN_MS = 200
export const RETRY_DELAY_MAX_MS = 5000

export function clampNumber(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min
	return Math.min(max, Math.max(min, value))
}

export function readRetryDefaults(): { retries: number; retryDelayMs: number } {
	if (typeof window === 'undefined') {
		return { retries: DEFAULT_RETRY_COUNT, retryDelayMs: DEFAULT_RETRY_DELAY_MS }
	}
	try {
		const rawRetries = window.localStorage.getItem(RETRY_COUNT_STORAGE_KEY)
		const rawDelay = window.localStorage.getItem(RETRY_DELAY_STORAGE_KEY)
		const retries = rawRetries ? Number.parseInt(rawRetries, 10) : DEFAULT_RETRY_COUNT
		const retryDelayMs = rawDelay ? Number.parseInt(rawDelay, 10) : DEFAULT_RETRY_DELAY_MS
		return {
			retries: clampNumber(retries, RETRY_COUNT_MIN, RETRY_COUNT_MAX),
			retryDelayMs: clampNumber(retryDelayMs, RETRY_DELAY_MIN_MS, RETRY_DELAY_MAX_MS),
		}
	} catch {
		return { retries: DEFAULT_RETRY_COUNT, retryDelayMs: DEFAULT_RETRY_DELAY_MS }
	}
}

export function parseRetryAfterSeconds(value: string | null): number | undefined {
	if (!value) return undefined
	const seconds = Number.parseInt(value, 10)
	if (Number.isFinite(seconds)) {
		return Math.max(0, seconds)
	}
	const parsedDate = Date.parse(value)
	if (!Number.isNaN(parsedDate)) {
		const diffMs = parsedDate - Date.now()
		if (diffMs <= 0) return 0
		return Math.ceil(diffMs / 1000)
	}
	return undefined
}
