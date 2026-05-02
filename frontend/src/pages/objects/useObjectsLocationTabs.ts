import { useCallback, useEffect, useMemo } from 'react'

import type { Location, LocationTab } from './objectsPageConstants'

type StateSetter<T> = (next: T | ((prev: T) => T)) => void

type UseObjectsLocationTabsArgs = {
	bucket: string
	prefix: string
	tabs: LocationTab[]
	activeTabId: string
	setBucket: StateSetter<string>
	setPrefix: StateSetter<string>
	setTabs: StateSetter<LocationTab[]>
	setActiveTabId: StateSetter<string>
	setRecentPrefixesByBucket: StateSetter<Record<string, string[]>>
	normalizePathInput: (raw: string) => string
}

function createLocationTab(bucket: string, prefix: string): LocationTab {
	return {
		id: `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
		bucket,
		prefix,
		history: [{ bucket, prefix }],
		historyIndex: 0,
	}
}

export function useObjectsLocationTabs({
	bucket,
	prefix,
	tabs,
	activeTabId,
	setBucket,
	setPrefix,
	setTabs,
	setActiveTabId,
	setRecentPrefixesByBucket,
	normalizePathInput,
}: UseObjectsLocationTabsArgs) {
	const activeTab = useMemo(
		() => tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null,
		[activeTabId, tabs],
	)

	useEffect(() => {
		if (tabs.length > 0) return
		const tab = createLocationTab(bucket, prefix)
		setTabs([tab])
		setActiveTabId(tab.id)
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
		const tab = createLocationTab(bucket, prefix)
		setTabs((prev) => [...prev, tab])
		setActiveTabId(tab.id)
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

	return {
		navigateToLocation,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		addTab,
		closeTab,
	}
}
