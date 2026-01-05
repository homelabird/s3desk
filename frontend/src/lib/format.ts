export type DateInput = string | number | Date | null | undefined

function toDate(value: DateInput): Date | null {
	if (value == null) return null
	if (value instanceof Date) {
		return Number.isFinite(value.getTime()) ? value : null
	}
	if (typeof value === 'number') {
		const d = new Date(value)
		return Number.isFinite(d.getTime()) ? d : null
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) return null
		const ts = Date.parse(trimmed)
		if (Number.isNaN(ts)) return null
		const d = new Date(ts)
		return Number.isFinite(d.getTime()) ? d : null
	}
	return null
}

export function toTimestamp(value: DateInput): number {
	const d = toDate(value)
	return d ? d.getTime() : 0
}

// Intl.DateTimeFormat is surprisingly expensive to construct.
// Cache formatters to avoid repeated allocations in large lists.
const dtfDateTime = new Intl.DateTimeFormat(undefined, {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
})

const dtfDateTimeNoSeconds = new Intl.DateTimeFormat(undefined, {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
})

const dtfTime = new Intl.DateTimeFormat(undefined, {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
})

export function formatDateTime(value: DateInput, opts?: { showSeconds?: boolean }): string {
	const d = toDate(value)
	if (!d) {
		// Preserve original strings when possible (useful for debugging).
		if (typeof value === 'string' && value.trim()) return value
		return '-'
	}

	return (opts?.showSeconds === false ? dtfDateTimeNoSeconds : dtfDateTime).format(d)
}

export function formatTime(value: DateInput): string {
	const d = toDate(value)
	if (!d) {
		if (typeof value === 'string' && value.trim()) return value
		return '-'
	}
	return dtfTime.format(d)
}

export function parseTimeMs(value: string | null | undefined): number {
	return toTimestamp(value)
}
