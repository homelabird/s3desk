import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useProfilesPageScopeState(apiToken: string) {
	const currentScopeKey = apiToken || 'none'
	const [createModalSession, setCreateModalSession] = useState(0)
	const [editModalSession, setEditModalSession] = useState(0)
	const serverScopeVersionRef = useRef(0)
	const isActiveRef = useRef(true)

	useLayoutEffect(() => {
		serverScopeVersionRef.current += 1
	}, [apiToken])

	useEffect(() => {
		return () => {
			isActiveRef.current = false
		}
	}, [])

	const advanceCreateModalSession = useCallback(() => {
		setCreateModalSession((prev) => prev + 1)
	}, [])

	const advanceEditModalSession = useCallback(() => {
		setEditModalSession((prev) => prev + 1)
	}, [])

	return {
		currentScopeKey,
		createModalSession,
		editModalSession,
		serverScopeVersionRef,
		isActiveRef,
		advanceCreateModalSession,
		advanceEditModalSession,
	}
}
