import type { InputRef } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import { objectsFeedback } from './objectsFeedback'

type UseObjectsPathModalStateArgs = {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
	navigateToLocation: (
		bucket: string,
		prefix: string,
		options?: { recordHistory?: boolean },
	) => void
}

export function useObjectsPathModalState({
	apiToken,
	profileId,
	bucket,
	prefix,
	navigateToLocation,
}: UseObjectsPathModalStateArgs) {
	const currentPathModalScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`
	const [pathDraft, setPathDraft] = useState(prefix)
	const [pathModalOpen, setPathModalOpen] = useState(false)
	const [pathModalScopeKey, setPathModalScopeKey] = useState('')
	const pathInputRef = useRef<InputRef | null>(null)
	const pathModalScopeMatches = pathModalScopeKey === currentPathModalScopeKey
	const activePathModalOpen = pathModalOpen && pathModalScopeMatches
	const activePathDraft = pathModalScopeMatches ? pathDraft : prefix

	useEffect(() => {
		setPathDraft(prefix)
	}, [prefix])

	const openPathModal = useCallback(() => {
		if (!profileId) {
			objectsFeedback.selectProfileFirst()
			return
		}
		if (!bucket) {
			objectsFeedback.selectBucketFirst()
			return
		}
		setPathDraft(prefix)
		setPathModalScopeKey(currentPathModalScopeKey)
		setPathModalOpen(true)
		window.setTimeout(() => {
			pathInputRef.current?.focus()
			pathInputRef.current?.select?.()
		}, 0)
	}, [bucket, currentPathModalScopeKey, prefix, profileId])

	const commitPathDraft = useCallback(() => {
		if (!pathModalScopeMatches) return
		if (!bucket) {
			objectsFeedback.selectBucketFirst()
			return
		}
		navigateToLocation(bucket, pathDraft, { recordHistory: true })
		setPathModalOpen(false)
		setPathModalScopeKey('')
	}, [bucket, navigateToLocation, pathDraft, pathModalScopeMatches])

	const setScopedPathModalOpen = useCallback(
		(open: boolean) => {
			setPathModalOpen(open)
			setPathModalScopeKey(open ? currentPathModalScopeKey : '')
			if (!open) {
				setPathDraft(prefix)
			}
		},
		[currentPathModalScopeKey, prefix],
	)

	const closePathModal = useCallback((nextDraft = prefix) => {
		setPathDraft(nextDraft)
		setPathModalOpen(false)
		setPathModalScopeKey('')
	}, [prefix])

	return {
		pathDraft: activePathDraft,
		setPathDraft,
		pathModalOpen: activePathModalOpen,
		setPathModalOpen: setScopedPathModalOpen,
		pathInputRef,
		openPathModal,
		commitPathDraft,
		closePathModal,
	}
}
