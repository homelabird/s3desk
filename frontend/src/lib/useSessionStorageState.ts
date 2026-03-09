import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Options = {
	legacyLocalStorageKey?: string
}

export function useSessionStorageState<T>(
	key: string,
	defaultValue: T,
	options: Options = {},
): [T, (next: T | ((prev: T) => T)) => void] {
	const stableDefaultSerialized = useMemo(() => JSON.stringify(defaultValue), [defaultValue])
	const stableDefaultValue = useMemo(() => JSON.parse(stableDefaultSerialized) as T, [stableDefaultSerialized])

	const parse = useCallback(
		(raw: string | null): T => {
			if (raw === null) return stableDefaultValue
			try {
				return JSON.parse(raw) as T
			} catch {
				return stableDefaultValue
			}
		},
		[stableDefaultValue],
	)

	const readValue = useCallback(
		(storageKey: string): T => {
			if (typeof window === 'undefined') return stableDefaultValue
			try {
				const sessionRaw = window.sessionStorage.getItem(storageKey)
				if (sessionRaw !== null) return parse(sessionRaw)
				if (options.legacyLocalStorageKey) {
					return parse(window.localStorage.getItem(options.legacyLocalStorageKey))
				}
				return stableDefaultValue
			} catch {
				return stableDefaultValue
			}
		},
		[options.legacyLocalStorageKey, parse, stableDefaultValue],
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
			const serialized = JSON.stringify(state)
			window.sessionStorage.setItem(key, serialized)
			if (options.legacyLocalStorageKey) {
				window.localStorage.removeItem(options.legacyLocalStorageKey)
			}
			window.dispatchEvent(new CustomEvent('session-storage', { detail: { key, value: serialized } }))
		} catch {
			// ignore
		}
	}, [key, options.legacyLocalStorageKey, state])

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
					return { key, value: (next as (prev: T) => T)(prev) }
				}
				return { key, value: next }
			})
		},
		[key, readValue],
	)

	return [state, set]
}
