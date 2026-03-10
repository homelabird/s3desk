import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Options<T> = {
	sanitize?: (value: T) => T
}

export function useLocalStorageState<T>(
	key: string,
	defaultValue: T,
	options: Options<T> = {},
): [T, (next: T | ((prev: T) => T)) => void] {
	const stableDefaultSerialized = useMemo(() => JSON.stringify(defaultValue), [defaultValue])
	const stableDefaultValue = useMemo(() => JSON.parse(stableDefaultSerialized) as T, [stableDefaultSerialized])
	const sanitizeValue = options.sanitize
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
			const serialized = JSON.stringify(sanitize(state))
			window.localStorage.setItem(key, serialized)
			window.dispatchEvent(new CustomEvent('local-storage', { detail: { key, value: serialized } }))
		} catch {
			// ignore
		}
	}, [key, sanitize, state])

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
					return { key, value: sanitize((next as (prev: T) => T)(prev)) }
				}
				return { key, value: sanitize(next) }
			})
		},
		[key, readValue, sanitize],
	)

	return [state, set]
}
