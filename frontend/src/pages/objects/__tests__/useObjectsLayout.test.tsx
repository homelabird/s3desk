import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectsLayout } from '../useObjectsLayout'

function buildArgs(overrides: Partial<Parameters<typeof useObjectsLayout>[0]> = {}): Parameters<typeof useObjectsLayout>[0] {
	return {
		layoutWidthPx: 1280,
		isDesktop: true,
		isWideDesktop: true,
		isAdvanced: true,
		detailsOpen: false,
		detailsDrawerOpen: false,
		setDetailsDrawerOpen: vi.fn(),
		setTreeDrawerOpen: vi.fn(),
		...overrides,
	}
}

describe('useObjectsLayout', () => {
	beforeEach(() => {
		window.localStorage.clear()
	})

	it('keeps the tree undocked on medium desktop widths so the main list can breathe', () => {
		const { result } = renderHook(() => useObjectsLayout(buildArgs({ layoutWidthPx: 1280 })))

		expect(result.current.dockTree).toBe(false)
		expect(result.current.isCompactList).toBe(false)
		expect(result.current.listViewportWidthPx).toBe(1280)
	})

	it('clamps stored tree widths to preserve a comfortable docked list viewport', () => {
		window.localStorage.setItem('objectsTreeWidth', JSON.stringify(600))

		const { result } = renderHook(() => useObjectsLayout(buildArgs({ layoutWidthPx: 1440 })))

		expect(result.current.dockTree).toBe(true)
		expect(result.current.treeWidthUsed).toBe(368)
		expect(result.current.listViewportWidthPx).toBe(1060)
		expect(result.current.isCompactList).toBe(false)
	})

	it('keeps simple mode on the desktop list layout when the remaining list viewport is still wide', () => {
		const { result } = renderHook(() => useObjectsLayout(buildArgs({ layoutWidthPx: 1340, isAdvanced: false })))

		expect(result.current.dockTree).toBe(true)
		expect(result.current.treeWidthUsed).toBe(256)
		expect(result.current.listViewportWidthPx).toBe(1072)
		expect(result.current.isCompactList).toBe(false)
	})

	it('keeps details undocked until the viewport is wide enough for a third pane', () => {
		const mediumWide = renderHook(() =>
			useObjectsLayout(buildArgs({ layoutWidthPx: 1560, detailsOpen: true, isWideDesktop: true })),
		)
		expect(mediumWide.result.current.dockDetails).toBe(false)

		const extraWide = renderHook(() =>
			useObjectsLayout(buildArgs({ layoutWidthPx: 1700, detailsOpen: true, isWideDesktop: true })),
		)
		expect(extraWide.result.current.dockDetails).toBe(true)
	})
})
