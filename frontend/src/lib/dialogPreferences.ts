const STORAGE_KEY = 'dismissedDialogPreferences'

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

export const buildDialogPreferenceKey = (scope: string, id: string): string => `${scope}:${id.trim()}`

export const isDialogDismissed = (key: string): boolean => !!readPreferences()[key.trim()]

export const setDialogDismissed = (key: string, dismissed: boolean) => {
	const trimmedKey = key.trim()
	if (!trimmedKey) return
	const current = readPreferences()
	if (dismissed) {
		writePreferences({
			...current,
			[trimmedKey]: { dismissedAt: new Date().toISOString() },
		})
		return
	}
	if (!(trimmedKey in current)) return
	const next = { ...current }
	delete next[trimmedKey]
	writePreferences(next)
}

export const countDismissedDialogs = (): number => Object.keys(readPreferences()).length

export const clearDismissedDialogs = () => {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.removeItem(STORAGE_KEY)
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
