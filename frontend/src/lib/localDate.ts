function isValidYyyyMmDd(value: string): value is `${number}-${number}-${number}` {
	return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function parseYyyyMmDd(value: string): { year: number; monthIndex: number; day: number } | null {
	if (!isValidYyyyMmDd(value)) return null
	const [yearRaw, monthRaw, dayRaw] = value.split('-')
	const year = Number(yearRaw)
	const monthIndex = Number(monthRaw) - 1
	const day = Number(dayRaw)
	if (!Number.isInteger(year) || year < 1900 || year > 9999) return null
	if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null
	if (!Number.isInteger(day) || day < 1 || day > 31) return null
	return { year, monthIndex, day }
}

export function formatLocalDateInputValue(ms: number | null): string {
	if (ms == null || !Number.isFinite(ms)) return ''
	const d = new Date(ms)
	if (!Number.isFinite(d.getTime())) return ''
	const year = d.getFullYear()
	const month = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

function buildLocalDateMs(value: string, kind: 'start' | 'end'): number | null {
	const parsed = parseYyyyMmDd(value)
	if (!parsed) return null
	const { year, monthIndex, day } = parsed
	const d =
		kind === 'start'
			? new Date(year, monthIndex, day, 0, 0, 0, 0)
			: new Date(year, monthIndex, day, 23, 59, 59, 999)
	// Guard against invalid dates like 2026-02-30 rolling over.
	if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) return null
	const ms = d.getTime()
	return Number.isFinite(ms) ? ms : null
}

export function localDayStartMsFromDateInput(value: string): number | null {
	if (!value) return null
	return buildLocalDateMs(value, 'start')
}

export function localDayEndMsFromDateInput(value: string): number | null {
	if (!value) return null
	return buildLocalDateMs(value, 'end')
}

