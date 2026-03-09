import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, (next: T | ((prev: T) => T)) => void] {
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
			try {
				return parse(window.localStorage.getItem(storageKey))
			} catch {
				return stableDefaultValue
			}
		},
		[parse, stableDefaultValue],
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
		try {
			const serialized = JSON.stringify(state)
			window.localStorage.setItem(key, serialized)
			window.dispatchEvent(new CustomEvent('local-storage', { detail: { key, value: serialized } }))
		} catch {
			// ignore
		}
	}, [key, state])

	useEffect(() => {
		const handleStorage = (event: StorageEvent) => {
			if (event.key !== key) return
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
		window.addEventListener('local-storage', handleCustom)
		return () => {
			window.removeEventListener('storage', handleStorage)
			window.removeEventListener('local-storage', handleCustom)
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
