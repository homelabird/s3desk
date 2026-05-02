export type BucketOption = {
	label: string
	value: string
}

export type BucketPickerEntry = BucketOption & {
	isCurrent: boolean
	isRecent: boolean
}

export type BucketPickerEntryGroups = {
	currentEntry: BucketPickerEntry | null
	recentEntries: BucketPickerEntry[]
	allEntries: BucketPickerEntry[]
}

export function normalizeBucketPickerTestIdPart(value: string): string {
	const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
	return normalized || 'bucket'
}

export function buildBucketEntries(value: string, options: BucketOption[], recentBuckets: string[]): BucketPickerEntry[] {
	const optionMap = new Map<string, BucketOption>()
	for (const option of options) {
		optionMap.set(option.value, option)
	}

	const currentEntry =
		value.trim().length > 0
			? {
					label: optionMap.get(value)?.label ?? value,
					value,
					isCurrent: true,
					isRecent: false,
				}
			: null

	const recentEntries = recentBuckets
		.filter((entry) => entry && entry !== value)
		.map((entry) => optionMap.get(entry))
		.filter((entry): entry is BucketOption => !!entry)
		.map((entry) => ({ ...entry, isCurrent: false, isRecent: true }))

	const recentSet = new Set(recentEntries.map((entry) => entry.value))
	const allEntries = options
		.filter((entry) => entry.value !== value && !recentSet.has(entry.value))
		.map((entry) => ({ ...entry, isCurrent: false, isRecent: false }))

	return [...(currentEntry ? [currentEntry] : []), ...recentEntries, ...allEntries]
}

export function filterBucketEntries(entries: BucketPickerEntry[], query: string): BucketPickerEntry[] {
	const normalizedQuery = query.trim().toLowerCase()
	if (!normalizedQuery) return entries
	return entries.filter((entry) => `${entry.label} ${entry.value}`.toLowerCase().includes(normalizedQuery))
}

export function splitBucketEntries(entries: BucketPickerEntry[]): BucketPickerEntryGroups {
	return {
		currentEntry: entries.find((entry) => entry.isCurrent) ?? null,
		recentEntries: entries.filter((entry) => entry.isRecent),
		allEntries: entries.filter((entry) => !entry.isCurrent && !entry.isRecent),
	}
}
