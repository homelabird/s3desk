const DEBUG_OBJECTS_LIST_KEY = 'debugObjectsList'
const DEBUG_CONTEXT_MENU_KEY = 'debugObjectsContextMenu'

export function isObjectsListDebugEnabled(): boolean {
	if (typeof window === 'undefined') return false
	try {
		return window.localStorage.getItem(DEBUG_OBJECTS_LIST_KEY) === 'true'
	} catch {
		return false
	}
}

export function isContextMenuDebugEnabled(): boolean {
	if (typeof window === 'undefined') return false
	try {
		return window.localStorage.getItem(DEBUG_CONTEXT_MENU_KEY) === 'true'
	} catch {
		return false
	}
}

export function logObjectsDebug(
	enabled: boolean,
	level: 'debug' | 'warn',
	message: string,
	context?: Record<string, unknown>,
): void {
	if (!enabled) return
	const prefix = `[objects] ${message}`
	if (level === 'warn') {
		if (context) console.warn(prefix, context)
		else console.warn(prefix)
		return
	}
	if (context) console.debug(prefix, context)
	else console.debug(prefix)
}

export function logContextMenuDebug(
	enabled: boolean,
	message: string,
	context?: Record<string, unknown>,
): void {
	if (!enabled) return
	const prefix = `[objects][context-menu] ${message}`
	if (context) console.debug(prefix, context)
	else console.debug(prefix)
}
