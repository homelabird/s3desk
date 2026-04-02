import { useCallback, useEffect, useRef } from 'react'

import { normalizePrefix, parentPrefixFromKey } from './objectsListUtils'

type UseObjectsSelectionEffectsArgs = {
	apiToken: string
	bucket: string
	prefix: string
	profileId: string | null
	favoritesOpenDetails: boolean
	navigateToLocation: (bucket: string, prefix: string, opts: { recordHistory: boolean }) => void
	setDetailsOpen: (value: boolean) => void
	setDetailsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>
	setTreeDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>
	setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>
	setLastSelectedObjectKey: React.Dispatch<React.SetStateAction<string | null>>
}

type PendingSelection = { key: string; openDetails: boolean }

export function useObjectsSelectionEffects({
	apiToken,
	bucket,
	prefix,
	profileId,
	favoritesOpenDetails,
	navigateToLocation,
	setDetailsOpen,
	setDetailsDrawerOpen,
	setTreeDrawerOpen,
	setSelectedKeys,
	setLastSelectedObjectKey,
}: UseObjectsSelectionEffectsArgs) {
	const pendingSelectRef = useRef<PendingSelection | null>(null)

	useEffect(() => {
		setSelectedKeys(new Set())
		setLastSelectedObjectKey(null)
	}, [apiToken, bucket, prefix, profileId, setLastSelectedObjectKey, setSelectedKeys])

	useEffect(() => {
		pendingSelectRef.current = null
	}, [apiToken, bucket, profileId])

	useEffect(() => {
		const pending = pendingSelectRef.current
		if (!pending) return
		const expectedPrefix = normalizePrefix(parentPrefixFromKey(pending.key))
		if (normalizePrefix(prefix) !== expectedPrefix) return
		pendingSelectRef.current = null
		setSelectedKeys(new Set([pending.key]))
		setLastSelectedObjectKey(pending.key)
		if (pending.openDetails) {
			setDetailsOpen(true)
			setDetailsDrawerOpen(true)
		}
	}, [prefix, setDetailsDrawerOpen, setDetailsOpen, setLastSelectedObjectKey, setSelectedKeys])

	const handleFavoriteSelect = useCallback(
		(key: string, closeDrawer: boolean) => {
			if (!bucket) return
			const targetPrefix = parentPrefixFromKey(key)
			const normalizedCurrent = normalizePrefix(prefix)
			const normalizedTarget = normalizePrefix(targetPrefix)

			if (normalizedCurrent === normalizedTarget) {
				setSelectedKeys(new Set([key]))
				setLastSelectedObjectKey(key)
				if (favoritesOpenDetails) {
					setDetailsOpen(true)
					setDetailsDrawerOpen(true)
				}
				if (closeDrawer) setTreeDrawerOpen(false)
				return
			}

			pendingSelectRef.current = { key, openDetails: favoritesOpenDetails }
			navigateToLocation(bucket, targetPrefix, { recordHistory: true })
			if (closeDrawer) setTreeDrawerOpen(false)
		},
		[
			bucket,
			favoritesOpenDetails,
			navigateToLocation,
			prefix,
			setDetailsDrawerOpen,
			setDetailsOpen,
			setLastSelectedObjectKey,
			setSelectedKeys,
			setTreeDrawerOpen,
		],
	)

	return {
		handleFavoriteSelect,
	}
}
