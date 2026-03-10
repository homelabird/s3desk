import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Options<T> = {
	legacyLocalStorageKey?: string
	sanitize?: (value: T) => T
}

export function useSessionStorageState<T>(
	key: string,
	defaultValue: T,
	options: Options<T> = {},
): [T, (next: T | ((prev: T) => T)) => void] {
	const stableDefaultSerialized = useMemo(() => JSON.stringify(defaultValue), [defaultValue])
	const stableDefaultValue = useMemo(() => JSON.parse(stableDefaultSerialized) as T, [stableDefaultSerialized])
	const sanitizeValue = options.sanitize
	const legacyLocalStorageKey = options.legacyLocalStorageKey
	const sanitize = useCallback(
		(value: T): T => {
			if (!sanitizeValue) return value
			try {
				return sanitizeValue(value)
			} catch {
				return stableDefaultValue
			}
		},
		[sanitizeValue, stableDefaultValue],
	)

	const parse = useCallback(
		(raw: string | null): T => {
			if (raw === null) return stableDefaultValue
			try {
				return sanitize(JSON.parse(raw) as T)
			} catch {
				return stableDefaultValue
			}
		},
		[sanitize, stableDefaultValue],
	)

	const readValue = useCallback(
		(storageKey: string): T => {
			if (typeof window === 'undefined') return stableDefaultValue
			try {
				const sessionRaw = window.sessionStorage.getItem(storageKey)
				if (sessionRaw !== null) return parse(sessionRaw)
				if (legacyLocalStorageKey) {
					return parse(window.localStorage.getItem(legacyLocalStorageKey))
				}
				return stableDefaultValue
			} catch {
				return stableDefaultValue
			}
		},
		[legacyLocalStorageKey, parse, stableDefaultValue],
	)

	const [stateSlot, setStateSlot] = useState<{ key: string; value: T }>(() => ({
		key,
		value: readValue(key),
	}))
	const state = stateSlot.key === key ? stateSlot.value : readValue(key)
	const stateRef = useRef(state)
	useEffect(() => {
		stateRef.current = state
	}, [state])

	useEffect(() => {
		if (typeof window === 'undefined') return
		try {
			const serialized = JSON.stringify(sanitize(state))
			window.sessionStorage.setItem(key, serialized)
			if (legacyLocalStorageKey) {
				window.localStorage.removeItem(legacyLocalStorageKey)
			}
			window.dispatchEvent(new CustomEvent('session-storage', { detail: { key, value: serialized } }))
		} catch {
			// ignore
		}
	}, [key, legacyLocalStorageKey, sanitize, state])

	useEffect(() => {
		if (typeof window === 'undefined') return

		const handleStorage = (event: StorageEvent) => {
			if (event.storageArea !== window.sessionStorage || event.key !== key) return
			const nextRaw = event.newValue
			const currentRaw = JSON.stringify(stateRef.current)
			if (nextRaw === currentRaw) return
			setStateSlot({ key, value: parse(nextRaw) })
		}

		const handleCustom = (event: Event) => {
			const detail = (event as CustomEvent<{ key?: string; value?: string }>).detail
			if (!detail || detail.key !== key) return
			const nextRaw = detail.value ?? null
			const currentRaw = JSON.stringify(stateRef.current)
			if (nextRaw === currentRaw) return
			setStateSlot({ key, value: parse(nextRaw) })
		}

		window.addEventListener('storage', handleStorage)
		window.addEventListener('session-storage', handleCustom)
		return () => {
			window.removeEventListener('storage', handleStorage)
			window.removeEventListener('session-storage', handleCustom)
		}
	}, [key, parse])

	const set = useCallback(
		(next: T | ((prev: T) => T)) => {
			setStateSlot((prevSlot) => {
				const prev = prevSlot.key === key ? prevSlot.value : readValue(key)
				if (typeof next === 'function') {
					return { key, value: sanitize((next as (prev: T) => T)(prev)) }
				}
				return { key, value: sanitize(next) }
			})
		},
		[key, readValue, sanitize],
	)

	return [state, set]
}
