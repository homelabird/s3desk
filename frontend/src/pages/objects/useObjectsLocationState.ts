import { message } from 'antd'
import type { InputRef } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { legacyProfileScopedStorageKey, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import type { Location, LocationTab } from './objectsPageConstants'
import { normalizePrefix } from './objectsListUtils'

type UseObjectsLocationStateParams = {
	apiToken: string
	profileId: string | null
}

export function useObjectsLocationState({ apiToken, profileId }: UseObjectsLocationStateParams) {
	const storageKey = useCallback(
		(name: string) => profileScopedStorageKey('objects', apiToken, profileId, name),
		[apiToken, profileId],
	)
	const legacyStorageKey = useCallback(
		(name: string) => legacyProfileScopedStorageKey('objects', profileId, name),
		[profileId],
	)

	const [bucket, setBucket] = useLocalStorageState<string>(storageKey('bucket'), '', {
		legacyLocalStorageKeys: [legacyStorageKey('bucket')],
	})
	const [prefix, setPrefix] = useLocalStorageState<string>(storageKey('prefix'), '', {
		legacyLocalStorageKeys: [legacyStorageKey('prefix')],
	})
	const [tabs, setTabs] = useLocalStorageState<LocationTab[]>(storageKey('tabs'), [], {
		legacyLocalStorageKeys: [legacyStorageKey('tabs')],
	})
	const [activeTabId, setActiveTabId] = useLocalStorageState<string>(storageKey('activeTabId'), '', {
		legacyLocalStorageKeys: [legacyStorageKey('activeTabId')],
	})
	const [recentBuckets, setRecentBuckets] = useLocalStorageState<string[]>(storageKey('recentBuckets'), [], {
		legacyLocalStorageKeys: [legacyStorageKey('recentBuckets')],
	})
	const [recentPrefixesByBucket, setRecentPrefixesByBucket] = useLocalStorageState<Record<string, string[]>>(
		storageKey('recentPrefixesByBucket'),
		{},
		{ legacyLocalStorageKeys: [legacyStorageKey('recentPrefixesByBucket')] },
	)
	const [bookmarksByBucket, setBookmarksByBucket] = useLocalStorageState<Record<string, string[]>>(
		storageKey('bookmarksByBucket'),
		{},
		{ legacyLocalStorageKeys: [legacyStorageKey('bookmarksByBucket')] },
	)
	const [prefixByBucket, setPrefixByBucket] = useLocalStorageState<Record<string, string>>(storageKey('prefixByBucket'), {}, {
		legacyLocalStorageKeys: [legacyStorageKey('prefixByBucket')],
	})
	const prefixByBucketRef = useRef<Record<string, string>>(prefixByBucket)
	const currentPathModalScopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${prefix}`

	const [pathDraft, setPathDraft] = useState(prefix)
	const [pathModalOpen, setPathModalOpen] = useState(false)
	const [pathModalScopeKey, setPathModalScopeKey] = useState('')
	const pathInputRef = useRef<InputRef | null>(null)
	const pathModalScopeMatches = pathModalScopeKey === currentPathModalScopeKey
	const activePathModalOpen = pathModalOpen && pathModalScopeMatches
	const activePathDraft = pathModalScopeMatches ? pathDraft : prefix

	const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null, [activeTabId, tabs])

	useEffect(() => {
		prefixByBucketRef.current = prefixByBucket
	}, [prefixByBucket])

	useEffect(() => {
		setPathDraft(prefix)
	}, [prefix])

	useEffect(() => {
		if (tabs.length > 0) return
		const id = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
		setTabs([{ id, bucket, prefix, history: [{ bucket, prefix }], historyIndex: 0 }])
		setActiveTabId(id)
	}, [bucket, prefix, setActiveTabId, setTabs, tabs.length])

	useEffect(() => {
		if (tabs.length === 0) return
		if (activeTabId && tabs.some((t) => t.id === activeTabId)) return
		setActiveTabId(tabs[0].id)
	}, [activeTabId, setActiveTabId, tabs])

	useEffect(() => {
		if (!activeTab) return
		if (bucket === activeTab.bucket && prefix === activeTab.prefix) return
		setBucket(activeTab.bucket)
		setPrefix(activeTab.prefix)
	}, [activeTab, bucket, prefix, setBucket, setPrefix])

	useEffect(() => {
		if (!bucket) return
		setPrefixByBucket((prev) => ({ ...prev, [bucket]: prefix }))
	}, [bucket, prefix, setPrefixByBucket])

	useEffect(() => {
		if (!bucket) return
		setRecentBuckets((prev) => [bucket, ...prev.filter((entry) => entry !== bucket)].slice(0, 12))
	}, [bucket, setRecentBuckets])

	const normalizePathInput = useCallback((raw: string): string => {
		const cleaned = raw.trim().replace(/^\/+/, '')
		if (!cleaned || cleaned === '/') return ''
		return normalizePrefix(cleaned)
	}, [])

	const openPathModal = useCallback(() => {
		if (!profileId) {
			message.info('Select a profile first')
			return
		}
		if (!bucket) {
			message.info('Select a bucket first')
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

	const navigateToLocation = useCallback(
		(nextBucket: string, nextPrefix: string, options?: { recordHistory?: boolean }) => {
			const b = nextBucket.trim()
			const p = b ? normalizePathInput(nextPrefix) : ''
			const loc: Location = { bucket: b, prefix: p }
			const recordHistory = options?.recordHistory ?? true

			setTabs((prev) => {
				if (prev.length === 0) return prev
				const idx = prev.findIndex((t) => t.id === activeTabId)
				if (idx === -1) return prev
				const tab = prev[idx]
				const current = tab.history[tab.historyIndex] ?? { bucket: tab.bucket, prefix: tab.prefix }
				const same = current.bucket === loc.bucket && current.prefix === loc.prefix

				let nextHistory = tab.history
				let nextHistoryIndex = tab.historyIndex
				if (recordHistory && !same) {
					nextHistory = tab.history.slice(0, tab.historyIndex + 1)
					nextHistory.push(loc)
					nextHistoryIndex = nextHistory.length - 1
				}

				const nextTab: LocationTab = {
					...tab,
					bucket: loc.bucket,
					prefix: loc.prefix,
					history: nextHistory,
					historyIndex: nextHistoryIndex,
				}
				const out = [...prev]
				out[idx] = nextTab
				return out
			})

			if (recordHistory && b) {
				const storedPrefix = p || '/'
				setRecentPrefixesByBucket((prev) => {
					const existing = prev[b] ?? []
					const next = [storedPrefix, ...existing.filter((v) => v !== storedPrefix)].slice(0, 30)
					return { ...prev, [b]: next }
				})
			}

			setBucket(b)
			setPrefix(p)
		},
		[activeTabId, normalizePathInput, setBucket, setPrefix, setRecentPrefixesByBucket, setTabs],
	)

	const canGoBack = !!activeTab && activeTab.historyIndex > 0
	const canGoForward = !!activeTab && activeTab.historyIndex < activeTab.history.length - 1

	const goBack = useCallback(() => {
		setTabs((prev) => {
			const idx = prev.findIndex((t) => t.id === activeTabId)
			if (idx === -1) return prev
			const tab = prev[idx]
			if (tab.historyIndex <= 0) return prev
			const nextIndex = tab.historyIndex - 1
			const loc = tab.history[nextIndex]
			if (!loc) return prev
			const out = [...prev]
			out[idx] = { ...tab, bucket: loc.bucket, prefix: loc.prefix, historyIndex: nextIndex }
			return out
		})
	}, [activeTabId, setTabs])

	const goForward = useCallback(() => {
		setTabs((prev) => {
			const idx = prev.findIndex((t) => t.id === activeTabId)
			if (idx === -1) return prev
			const tab = prev[idx]
			if (tab.historyIndex >= tab.history.length - 1) return prev
			const nextIndex = tab.historyIndex + 1
			const loc = tab.history[nextIndex]
			if (!loc) return prev
			const out = [...prev]
			out[idx] = { ...tab, bucket: loc.bucket, prefix: loc.prefix, historyIndex: nextIndex }
			return out
		})
	}, [activeTabId, setTabs])

	const addTab = useCallback(() => {
		const id = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
		const tab: LocationTab = { id, bucket, prefix, history: [{ bucket, prefix }], historyIndex: 0 }
		setTabs((prev) => [...prev, tab])
		setActiveTabId(id)
	}, [bucket, prefix, setActiveTabId, setTabs])

	const closeTab = useCallback(
		(id: string) => {
			setTabs((prev) => {
				if (prev.length <= 1) return prev
				const idx = prev.findIndex((t) => t.id === id)
				if (idx === -1) return prev
				const next = prev.filter((t) => t.id !== id)
				if (activeTabId === id) {
					const nextActive = next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? ''
					setActiveTabId(nextActive)
				}
				return next
			})
		},
		[activeTabId, setActiveTabId, setTabs],
	)

	const pathOptions = useMemo(() => {
		if (!bucket) return []
		const bookmarks = bookmarksByBucket[bucket] ?? []
		const recent = recentPrefixesByBucket[bucket] ?? []
		const all = [...bookmarks, ...recent.filter((p) => !bookmarks.includes(p))]
		const q = pathDraft.trim().toLowerCase()
		const filtered = q ? all.filter((p) => p.toLowerCase().includes(q)) : all
		return filtered.slice(0, 30).map((p) => ({ value: p }))
	}, [bookmarksByBucket, bucket, pathDraft, recentPrefixesByBucket])

	const normalizedCurrentPrefix = normalizePathInput(prefix)
	const storedCurrentPrefix = normalizedCurrentPrefix || '/'
	const isBookmarked = !!bucket && (bookmarksByBucket[bucket] ?? []).includes(storedCurrentPrefix)

	const toggleBookmark = useCallback(() => {
		if (!bucket) return
		const p = storedCurrentPrefix
		setBookmarksByBucket((prev) => {
			const existing = prev[bucket] ?? []
			const next = existing.includes(p) ? existing.filter((v) => v !== p) : [p, ...existing].slice(0, 50)
			return { ...prev, [bucket]: next }
		})
	}, [bucket, setBookmarksByBucket, storedCurrentPrefix])

	const canGoUp = !!bucket && !!prefix && prefix.includes('/')
	const onUp = useCallback(() => {
		if (!bucket) return
		const p = prefix.replace(/\/+$/, '')
		const idx = p.lastIndexOf('/')
		const next = idx === -1 ? '' : p.slice(0, idx + 1)
		navigateToLocation(bucket, next, { recordHistory: true })
	}, [bucket, navigateToLocation, prefix])

	const onOpenPrefix = useCallback(
		(nextPrefix: string) => {
			if (!bucket) return
			navigateToLocation(bucket, nextPrefix, { recordHistory: true })
		},
		[bucket, navigateToLocation],
	)

	const commitPathDraft = useCallback(() => {
		if (!pathModalScopeMatches) return
		if (!bucket) {
			message.info('Select a bucket first')
			return
		}
		navigateToLocation(bucket, pathDraft, { recordHistory: true })
		setPathModalOpen(false)
		setPathModalScopeKey('')
	}, [bucket, navigateToLocation, pathDraft, pathModalScopeMatches])

	const clearInvalidLocation = useCallback((invalidBucketRaw?: string) => {
		const invalidBucket = (invalidBucketRaw ?? bucket).trim()
		if (!invalidBucket) return

		setTabs((prev) =>
			prev.map((tab) => {
				if (tab.bucket !== invalidBucket && !tab.history.some((entry) => entry.bucket === invalidBucket)) {
					return tab
				}
				const nextHistory = tab.history.map((entry) =>
					entry.bucket === invalidBucket ? { bucket: '', prefix: '' } : entry,
				)
				const nextCurrent = tab.bucket === invalidBucket ? { bucket: '', prefix: '' } : { bucket: tab.bucket, prefix: tab.prefix }
				return {
					...tab,
					bucket: nextCurrent.bucket,
					prefix: nextCurrent.prefix,
					history: nextHistory,
					historyIndex: Math.min(tab.historyIndex, Math.max(0, nextHistory.length - 1)),
				}
			}),
		)
		setRecentBuckets((prev) => prev.filter((entry) => entry !== invalidBucket))
		setRecentPrefixesByBucket((prev) => {
			if (!(invalidBucket in prev)) return prev
			const next = { ...prev }
			delete next[invalidBucket]
			return next
		})
		setBookmarksByBucket((prev) => {
			if (!(invalidBucket in prev)) return prev
			const next = { ...prev }
			delete next[invalidBucket]
			return next
		})
		setPrefixByBucket((prev) => {
			if (!(invalidBucket in prev)) return prev
			const next = { ...prev }
			delete next[invalidBucket]
			return next
		})
		if (bucket === invalidBucket) {
			setBucket('')
			setPrefix('')
			setPathDraft('')
			setPathModalOpen(false)
			setPathModalScopeKey('')
		}
	}, [bucket, setBookmarksByBucket, setBucket, setPathDraft, setPathModalOpen, setPrefix, setPrefixByBucket, setRecentBuckets, setRecentPrefixesByBucket, setTabs])

	const handleSetPathModalOpen = useCallback((open: boolean) => {
		setPathModalOpen(open)
		setPathModalScopeKey(open ? currentPathModalScopeKey : '')
		if (!open) {
			setPathDraft(prefix)
		}
	}, [currentPathModalScopeKey, prefix])

	return {
		bucket,
		prefix,
		tabs,
		activeTabId,
		recentBuckets,
		setActiveTabId,
		pathDraft: activePathDraft,
		setPathDraft,
		pathModalOpen: activePathModalOpen,
		setPathModalOpen: handleSetPathModalOpen,
		pathInputRef,
		openPathModal,
		prefixByBucketRef,
		navigateToLocation,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		addTab,
		closeTab,
		pathOptions,
		isBookmarked,
		toggleBookmark,
		canGoUp,
		onUp,
		onOpenPrefix,
		commitPathDraft,
		clearInvalidLocation,
	}
}
