import { message } from 'antd'
import type { InputRef } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'
import type { Location, LocationTab } from './objectsPageConstants'
import { normalizePrefix } from './objectsListUtils'

type UseObjectsLocationStateParams = {
	profileId: string | null
}

export function useObjectsLocationState({ profileId }: UseObjectsLocationStateParams) {
	const [bucket, setBucket] = useLocalStorageState<string>('bucket', '')
	const [prefix, setPrefix] = useLocalStorageState<string>('prefix', '')
	const [tabs, setTabs] = useLocalStorageState<LocationTab[]>('objectsTabs', [])
	const [activeTabId, setActiveTabId] = useLocalStorageState<string>('objectsActiveTabId', '')
	const [recentPrefixesByBucket, setRecentPrefixesByBucket] = useLocalStorageState<Record<string, string[]>>(
		'objectsRecentPrefixesByBucket',
		{},
	)
	const [bookmarksByBucket, setBookmarksByBucket] = useLocalStorageState<Record<string, string[]>>(
		'objectsBookmarksByBucket',
		{},
	)
	const [prefixByBucket, setPrefixByBucket] = useLocalStorageState<Record<string, string>>('objectsPrefixByBucket', {})
	const prefixByBucketRef = useRef<Record<string, string>>(prefixByBucket)

	const [pathDraft, setPathDraft] = useState(prefix)
	const [pathModalOpen, setPathModalOpen] = useState(false)
	const pathInputRef = useRef<InputRef | null>(null)

	const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null, [activeTabId, tabs])

	useEffect(() => {
		prefixByBucketRef.current = prefixByBucket
	}, [prefixByBucket])

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
		setPathModalOpen(true)
		window.setTimeout(() => {
			pathInputRef.current?.focus()
			pathInputRef.current?.select?.()
		}, 0)
	}, [bucket, prefix, profileId])

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
		if (!bucket) {
			message.info('Select a bucket first')
			return
		}
		navigateToLocation(bucket, pathDraft, { recordHistory: true })
		setPathModalOpen(false)
	}, [bucket, navigateToLocation, pathDraft])

	return {
		bucket,
		prefix,
		tabs,
		activeTabId,
		setActiveTabId,
		pathDraft,
		setPathDraft,
		pathModalOpen,
		setPathModalOpen,
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
	}
}
