import { useCallback, useEffect, useRef, useState } from 'react'

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, (next: T | ((prev: T) => T)) => void] {
	const [state, setState] = useState<T>(() => {
		try {
			const raw = window.localStorage.getItem(key)
			if (raw === null) return defaultValue
			return JSON.parse(raw) as T
		} catch {
			return defaultValue
		}
	})
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
		const parse = (raw: string | null): T => {
			if (raw === null) return defaultValue
			try {
				return JSON.parse(raw) as T
			} catch {
				return defaultValue
			}
		}

		const handleStorage = (event: StorageEvent) => {
			if (event.key !== key) return
			const nextRaw = event.newValue
			const currentRaw = JSON.stringify(stateRef.current)
			if (nextRaw === currentRaw) return
			setState(parse(nextRaw))
		}

		const handleCustom = (event: Event) => {
			const detail = (event as CustomEvent<{ key?: string; value?: string }>).detail
			if (!detail || detail.key !== key) return
			const nextRaw = detail.value ?? null
			const currentRaw = JSON.stringify(stateRef.current)
			if (nextRaw === currentRaw) return
			setState(parse(nextRaw))
		}

		window.addEventListener('storage', handleStorage)
		window.addEventListener('local-storage', handleCustom)
		return () => {
			window.removeEventListener('storage', handleStorage)
			window.removeEventListener('local-storage', handleCustom)
		}
	}, [defaultValue, key])

	const set = useCallback(
		(next: T | ((prev: T) => T)) => {
			setState((prev) => {
				if (typeof next === 'function') {
					return (next as (prev: T) => T)(prev)
				}
				return next
			})
		},
		[setState],
	)

	return [state, set]
}
