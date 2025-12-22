import { useCallback, useEffect, useState } from 'react'

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

	useEffect(() => {
		try {
			window.localStorage.setItem(key, JSON.stringify(state))
		} catch {
			// ignore
		}
	}, [key, state])

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
