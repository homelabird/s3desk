export type Location = { bucket: string; prefix: string }

export type LocationTab = {
	id: string
	bucket: string
	prefix: string
	history: Location[]
	historyIndex: number
}

export type ObjectsUIMode = 'simple' | 'advanced'

export const OBJECTS_LIST_PAGE_SIZE = 200
export const AUTO_INDEX_COOLDOWN_MS = 5 * 60 * 1000
export const COMPACT_ROW_HEIGHT_PX = 52
export const WIDE_ROW_HEIGHT_PX = 40
