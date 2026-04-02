import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useObjectsContextMenu } from '../useObjectsContextMenu'

describe('useObjectsContextMenu', () => {
	it('hides the context menu when the api token changes for the same location', () => {
		const { result, rerender } = renderHook(
			({ scopeKey }: { scopeKey: string }) =>
				useObjectsContextMenu({
					scopeKey,
					debugEnabled: false,
					log: vi.fn(),
					listScrollerEl: null,
					scrollContainerRef: { current: null },
					selectedCount: 0,
					objectByKey: new Map(),
					selectedKeys: new Set(),
					getObjectActions: vi.fn(() => []),
					getPrefixActions: vi.fn(() => []),
					selectionContextMenuActions: [],
					globalActionMap: new Map(),
					selectionActionMap: new Map(),
					isAdvanced: false,
					ensureObjectSelected: vi.fn(),
				}),
			{ initialProps: { scopeKey: 'token-a:profile-1:bucket-a:docs/' } },
		)

		act(() => {
			result.current.openListContextMenu({ x: 24, y: 48 })
		})

		expect(result.current.contextMenuState.open).toBe(true)

		rerender({ scopeKey: 'token-b:profile-1:bucket-a:docs/' })

		expect(result.current.contextMenuState.open).toBe(false)
		expect(result.current.contextMenuVisible).toBe(false)
		expect(result.current.contextMenuStyle).toBeNull()
	})
})
