import { useCallback, useEffect, useMemo, useRef, type PointerEvent } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { clampNumber } from './objectsListUtils'

type UseObjectsLayoutArgs = {
	layoutWidthPx: number
	isDesktop: boolean
	isWideDesktop: boolean
	isAdvanced: boolean
	detailsOpen: boolean
	detailsDrawerOpen: boolean
	setDetailsDrawerOpen: (open: boolean | ((prev: boolean) => boolean)) => void
	setTreeDrawerOpen: (open: boolean | ((prev: boolean) => boolean)) => void
}

export function useObjectsLayout({
	layoutWidthPx,
	isDesktop,
	isWideDesktop,
	isAdvanced,
	detailsOpen,
	detailsDrawerOpen,
	setDetailsDrawerOpen,
	setTreeDrawerOpen,
}: UseObjectsLayoutArgs) {
	const [treeWidth, setTreeWidth] = useLocalStorageState<number>('objectsTreeWidth', 300)
	const [detailsWidth, setDetailsWidth] = useLocalStorageState<number>('objectsDetailsWidth', 480)

	const minTreeWidth = 220
	const maxTreeWidth = 720
	const minDetailsWidth = 320
	const maxDetailsWidth = 920
	const minCenterWidth = 360
	const treeResizeHandleWidth = 12
	const detailsResizeHandleWidth = 12
	const collapsedDetailsWidth = 36
	const minDockedTreeWidth = minCenterWidth + minTreeWidth + treeResizeHandleWidth
	const minDockedDetailsWidth = minDockedTreeWidth + minDetailsWidth + detailsResizeHandleWidth
	const compactListMinWidth = 980

	const dockTree = isDesktop && (layoutWidthPx <= 0 || layoutWidthPx >= minDockedTreeWidth)
	const dockDetails = isWideDesktop && (layoutWidthPx <= 0 || layoutWidthPx >= minDockedDetailsWidth)
	const detailsDocked = dockDetails
	const detailsVisible = detailsDocked ? detailsOpen : detailsDrawerOpen

	useEffect(() => {
		if (dockTree) setTreeDrawerOpen(false)
		if (dockDetails) setDetailsDrawerOpen(false)
	}, [dockDetails, dockTree, setDetailsDrawerOpen, setTreeDrawerOpen])

	const { treeWidthUsed, detailsWidthUsed } = useMemo(() => {
		let tree = dockTree ? clampNumber(treeWidth, minTreeWidth, maxTreeWidth) : 0
		let details = 0
		if (dockDetails) {
			details = detailsOpen ? clampNumber(detailsWidth, minDetailsWidth, maxDetailsWidth) : collapsedDetailsWidth
		}

		if (!isDesktop || layoutWidthPx <= 0) {
			return { treeWidthUsed: tree, detailsWidthUsed: details }
		}

		if (!dockTree) {
			return { treeWidthUsed: 0, detailsWidthUsed: 0 }
		}

		if (!dockDetails) {
			const handles = treeResizeHandleWidth
			const available = Math.max(0, layoutWidthPx - handles)
			const maxTree = clampNumber(available - minCenterWidth, minTreeWidth, maxTreeWidth)
			tree = clampNumber(tree, minTreeWidth, maxTree)
			return { treeWidthUsed: tree, detailsWidthUsed: 0 }
		}

		const handles = treeResizeHandleWidth + (detailsOpen ? detailsResizeHandleWidth : 0)
		const available = Math.max(0, layoutWidthPx - handles)

		let overflow = tree + details + minCenterWidth - available
		if (overflow > 0 && detailsOpen) {
			const reducible = details - minDetailsWidth
			const reduce = Math.min(reducible, overflow)
			details -= reduce
			overflow -= reduce
		}
		if (overflow > 0) {
			const reducible = tree - minTreeWidth
			const reduce = Math.min(reducible, overflow)
			tree -= reduce
			overflow -= reduce
		}

		return { treeWidthUsed: tree, detailsWidthUsed: details }
	}, [
		collapsedDetailsWidth,
		detailsOpen,
		detailsWidth,
		dockDetails,
		dockTree,
		isDesktop,
		layoutWidthPx,
		maxDetailsWidth,
		maxTreeWidth,
		minCenterWidth,
		minDetailsWidth,
		minTreeWidth,
		treeResizeHandleWidth,
		treeWidth,
	])

	const dynamicMaxTreeWidth = useMemo(() => {
		if (!dockTree || !isDesktop || layoutWidthPx <= 0) return maxTreeWidth
		const handles = treeResizeHandleWidth + (dockDetails && detailsOpen ? detailsResizeHandleWidth : 0)
		const available = Math.max(0, layoutWidthPx - handles)
		const details = dockDetails ? detailsWidthUsed : 0
		return clampNumber(available - minCenterWidth - details, minTreeWidth, maxTreeWidth)
	}, [
		detailsOpen,
		detailsWidthUsed,
		dockDetails,
		dockTree,
		isDesktop,
		layoutWidthPx,
		maxTreeWidth,
		minCenterWidth,
		minTreeWidth,
		treeResizeHandleWidth,
	])

	const dynamicMaxDetailsWidth = useMemo(() => {
		if (!dockDetails || !isDesktop || !detailsOpen || layoutWidthPx <= 0) return maxDetailsWidth
		const handles = treeResizeHandleWidth + detailsResizeHandleWidth
		const available = Math.max(0, layoutWidthPx - handles)
		return clampNumber(available - minCenterWidth - treeWidthUsed, minDetailsWidth, maxDetailsWidth)
	}, [
		detailsOpen,
		dockDetails,
		isDesktop,
		layoutWidthPx,
		maxDetailsWidth,
		minCenterWidth,
		minDetailsWidth,
		treeResizeHandleWidth,
		treeWidthUsed,
	])

	const listViewportWidthPx = useMemo(() => {
		if (layoutWidthPx <= 0) return 0
		if (!isDesktop) return layoutWidthPx
		const handles = (dockTree ? treeResizeHandleWidth : 0) + (dockDetails && detailsOpen ? detailsResizeHandleWidth : 0)
		const tree = dockTree ? treeWidthUsed : 0
		const details = dockDetails ? detailsWidthUsed : 0
		return Math.max(0, layoutWidthPx - handles - tree - details)
	}, [
		detailsOpen,
		detailsWidthUsed,
		dockDetails,
		dockTree,
		isDesktop,
		layoutWidthPx,
		treeResizeHandleWidth,
		treeWidthUsed,
		detailsResizeHandleWidth,
	])

	const isCompactList = !isDesktop || !isAdvanced || (isDesktop && (listViewportWidthPx <= 0 || listViewportWidthPx < compactListMinWidth))

	const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
	const onTreeResizePointerDown = useCallback(
		(e: PointerEvent<HTMLDivElement>) => {
			if (e.button !== 0) return
			treeResizeRef.current = { startX: e.clientX, startWidth: treeWidthUsed }
			e.currentTarget.setPointerCapture(e.pointerId)
			e.preventDefault()
		},
		[treeWidthUsed],
	)
	const onTreeResizePointerMove = useCallback(
		(e: PointerEvent<HTMLDivElement>) => {
			const state = treeResizeRef.current
			if (!state) return
			const dx = e.clientX - state.startX
			const raw = state.startWidth + dx
			const next = clampNumber(Math.round(raw), minTreeWidth, dynamicMaxTreeWidth)
			setTreeWidth(next)
			e.preventDefault()
		},
		[dynamicMaxTreeWidth, minTreeWidth, setTreeWidth],
	)
	const onTreeResizePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
		if (!treeResizeRef.current) return
		treeResizeRef.current = null
		try {
			e.currentTarget.releasePointerCapture(e.pointerId)
		} catch {
			// ignore
		}
	}, [])

	const detailsResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
	const onDetailsResizePointerDown = useCallback(
		(e: PointerEvent<HTMLDivElement>) => {
			if (e.button !== 0) return
			detailsResizeRef.current = { startX: e.clientX, startWidth: detailsWidthUsed }
			e.currentTarget.setPointerCapture(e.pointerId)
			e.preventDefault()
		},
		[detailsWidthUsed],
	)
	const onDetailsResizePointerMove = useCallback(
		(e: PointerEvent<HTMLDivElement>) => {
			const state = detailsResizeRef.current
			if (!state) return
			const dx = state.startX - e.clientX
			const raw = state.startWidth + dx
			const next = clampNumber(Math.round(raw), minDetailsWidth, dynamicMaxDetailsWidth)
			setDetailsWidth(next)
			e.preventDefault()
		},
		[dynamicMaxDetailsWidth, minDetailsWidth, setDetailsWidth],
	)
	const onDetailsResizePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
		if (!detailsResizeRef.current) return
		detailsResizeRef.current = null
		try {
			e.currentTarget.releasePointerCapture(e.pointerId)
		} catch {
			// ignore
		}
	}, [])

	return {
		dockTree,
		dockDetails,
		detailsDocked,
		detailsVisible,
		treeWidthUsed,
		detailsWidthUsed,
		listViewportWidthPx,
		isCompactList,
		treeResizeHandleWidth,
		detailsResizeHandleWidth,
		onTreeResizePointerDown,
		onTreeResizePointerMove,
		onTreeResizePointerUp,
		onDetailsResizePointerDown,
		onDetailsResizePointerMove,
		onDetailsResizePointerUp,
	}
}
