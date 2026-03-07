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
export const COMPACT_ROW_HEIGHT_PX = 68
export const WIDE_ROW_HEIGHT_PX = 72
export const COMPACT_LIST_THUMBNAIL_PX = 40
export const WIDE_LIST_THUMBNAIL_PX = 56
export const GRID_CARD_THUMBNAIL_PX = 144
