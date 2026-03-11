import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ContextMenuState } from '../objectsContextMenuTypes'
import { useObjectsContextMenuLifecycle } from '../useObjectsContextMenuLifecycle'

function createContextMenuState(overrides: Partial<ContextMenuState> = {}): ContextMenuState {
	return {
		open: false,
		source: null,
		kind: null,
		key: null,
		...overrides,
	}
}

describe('useObjectsContextMenuLifecycle', () => {
	afterEach(() => {
		document.body.innerHTML = ''
		vi.restoreAllMocks()
	})

	it('opens the list context menu from an empty list area', () => {
		const recordContextMenuPoint = vi.fn().mockReturnValue({ x: 24, y: 48 })
		const openListContextMenu = vi.fn()
		const closeContextMenu = vi.fn()
		const listScrollerEl = document.createElement('div')
		document.body.appendChild(listScrollerEl)
		const scrollContainerRef = { current: listScrollerEl }

		const { result } = renderHook(() =>
			useObjectsContextMenuLifecycle({
				listScrollerEl,
				scrollContainerRef,
				selectedCount: 0,
				contextMenuState: createContextMenuState(),
				contextMenuPoint: null,
				contextMenuVisible: false,
				recordContextMenuPoint,
				openListContextMenu,
				closeContextMenu,
			}),
		)

		const target = document.createElement('div')
		const event = {
			target,
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		} as unknown as React.MouseEvent<HTMLDivElement>

		act(() => {
			result.current.handleListScrollerContextMenu(event)
		})

		expect(event.preventDefault).toHaveBeenCalledTimes(1)
		expect(event.stopPropagation).toHaveBeenCalledTimes(1)
		expect(recordContextMenuPoint).toHaveBeenCalledWith(event)
		expect(openListContextMenu).toHaveBeenCalledWith({ x: 24, y: 48 })
		expect(closeContextMenu).not.toHaveBeenCalled()
	})

	it('closes the context menu when Escape is pressed', () => {
		const closeContextMenu = vi.fn()
		const listScrollerEl = document.createElement('div')
		document.body.appendChild(listScrollerEl)
		const scrollContainerRef = { current: listScrollerEl }

		renderHook(() =>
			useObjectsContextMenuLifecycle({
				listScrollerEl,
				scrollContainerRef,
				selectedCount: 0,
				contextMenuState: createContextMenuState({
					open: true,
					source: 'context',
					kind: 'list',
					key: '__list__',
				}),
				contextMenuPoint: { x: 16, y: 20 },
				contextMenuVisible: true,
				recordContextMenuPoint: vi.fn(),
				openListContextMenu: vi.fn(),
				closeContextMenu,
			}),
		)

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		})

		expect(closeContextMenu).toHaveBeenCalledWith(undefined, 'escape')
	})

	it('consumes Escape when closing the context menu', () => {
		const closeContextMenu = vi.fn()
		const listScrollerEl = document.createElement('div')
		document.body.appendChild(listScrollerEl)
		const scrollContainerRef = { current: listScrollerEl }

		renderHook(() =>
			useObjectsContextMenuLifecycle({
				listScrollerEl,
				scrollContainerRef,
				selectedCount: 2,
				contextMenuState: createContextMenuState({
					open: true,
					source: 'context',
					kind: 'object',
					key: 'video-1.mp4',
				}),
				contextMenuPoint: { x: 16, y: 20 },
				contextMenuVisible: true,
				recordContextMenuPoint: vi.fn(),
				openListContextMenu: vi.fn(),
				closeContextMenu,
			}),
		)

		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		const stopPropagation = vi.spyOn(event, 'stopPropagation')
		const preventDefault = vi.spyOn(event, 'preventDefault')

		act(() => {
			document.dispatchEvent(event)
		})

		expect(closeContextMenu).toHaveBeenCalledWith(undefined, 'escape')
		expect(preventDefault).toHaveBeenCalledTimes(1)
		expect(stopPropagation).toHaveBeenCalledTimes(1)
	})
})
