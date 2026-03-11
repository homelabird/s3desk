import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useObjectsSelectionHandlers } from '../useObjectsSelectionHandlers'

function createPointerEvent(overrides: Partial<Pick<React.MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>> = {}) {
	return {
		shiftKey: false,
		ctrlKey: false,
		metaKey: false,
		stopPropagation: vi.fn(),
		...overrides,
	} as unknown as React.MouseEvent
}

describe('useObjectsSelectionHandlers', () => {
	it('selects a contiguous range on shift-click', () => {
		let selectedKeys = new Set<string>(['docs/a.txt'])
		let lastSelectedObjectKey: string | null = 'docs/a.txt'

		const { result } = renderHook(() =>
			useObjectsSelectionHandlers({
				orderedVisibleObjectKeys: ['docs/a.txt', 'docs/b.txt', 'docs/c.txt'],
				lastSelectedObjectKey,
				setSelectedKeys: (next) => {
					selectedKeys = typeof next === 'function' ? next(selectedKeys) : next
				},
				setLastSelectedObjectKey: (next) => {
					lastSelectedObjectKey = typeof next === 'function' ? next(lastSelectedObjectKey) : next
				},
			}),
		)

		act(() => {
			result.current.selectObjectFromPointerEvent(createPointerEvent({ shiftKey: true }), 'docs/c.txt')
		})

		expect(Array.from(selectedKeys)).toEqual(['docs/a.txt', 'docs/b.txt', 'docs/c.txt'])
		expect(lastSelectedObjectKey).toBe('docs/c.txt')
	})

	it('adds a range to the current selection on ctrl+shift click', () => {
		let selectedKeys = new Set<string>(['docs/root.txt'])
		let lastSelectedObjectKey: string | null = 'docs/a.txt'

		const { result } = renderHook(() =>
			useObjectsSelectionHandlers({
				orderedVisibleObjectKeys: ['docs/a.txt', 'docs/b.txt', 'docs/c.txt'],
				lastSelectedObjectKey,
				setSelectedKeys: (next) => {
					selectedKeys = typeof next === 'function' ? next(selectedKeys) : next
				},
				setLastSelectedObjectKey: (next) => {
					lastSelectedObjectKey = typeof next === 'function' ? next(lastSelectedObjectKey) : next
				},
			}),
		)

		act(() => {
			result.current.selectObjectFromPointerEvent(
				createPointerEvent({ shiftKey: true, ctrlKey: true }),
				'docs/c.txt',
			)
		})

		expect(Array.from(selectedKeys)).toEqual(['docs/root.txt', 'docs/a.txt', 'docs/b.txt', 'docs/c.txt'])
		expect(lastSelectedObjectKey).toBe('docs/c.txt')
	})

	it('toggles a single key on ctrl-click and keeps the rest of the selection', () => {
		let selectedKeys = new Set<string>(['docs/a.txt', 'docs/b.txt'])
		let lastSelectedObjectKey: string | null = 'docs/b.txt'

		const { result } = renderHook(() =>
			useObjectsSelectionHandlers({
				orderedVisibleObjectKeys: ['docs/a.txt', 'docs/b.txt', 'docs/c.txt'],
				lastSelectedObjectKey,
				setSelectedKeys: (next) => {
					selectedKeys = typeof next === 'function' ? next(selectedKeys) : next
				},
				setLastSelectedObjectKey: (next) => {
					lastSelectedObjectKey = typeof next === 'function' ? next(lastSelectedObjectKey) : next
				},
			}),
		)

		act(() => {
			result.current.selectObjectFromPointerEvent(createPointerEvent({ ctrlKey: true }), 'docs/b.txt')
		})

		expect(Array.from(selectedKeys)).toEqual(['docs/a.txt'])
		expect(lastSelectedObjectKey).toBe('docs/b.txt')
	})
})
