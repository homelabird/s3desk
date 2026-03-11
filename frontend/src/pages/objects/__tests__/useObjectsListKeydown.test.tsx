import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useObjectsListKeydown } from '../useObjectsListKeydown'

function createKeyboardEvent(
	key: string,
	overrides: Partial<Pick<React.KeyboardEvent<HTMLDivElement>, 'shiftKey' | 'ctrlKey' | 'metaKey'>> = {},
) {
	return {
		key,
		shiftKey: false,
		ctrlKey: false,
		metaKey: false,
		preventDefault: vi.fn(),
		...overrides,
	} as unknown as React.KeyboardEvent<HTMLDivElement>
}

function createArgs(): Parameters<typeof useObjectsListKeydown>[0] {
	return {
		contextMenuOpen: false,
		selectedCount: 1,
		singleSelectedKey: 'docs/a.txt',
		lastSelectedObjectKey: 'docs/a.txt',
		orderedVisibleObjectKeys: ['docs/a.txt', 'docs/b.txt', 'docs/c.txt'],
		visibleObjectKeys: ['docs/a.txt', 'docs/b.txt', 'docs/c.txt'],
		rowIndexByObjectKey: new Map([
			['docs/a.txt', 0],
			['docs/b.txt', 1],
			['docs/c.txt', 2],
		]),
		canGoUp: true,
		onCloseContextMenu: vi.fn(),
		onClearSelection: vi.fn(),
		onOpenRename: vi.fn(),
		onNewFolder: vi.fn(),
		onCopySelection: vi.fn(),
		onPasteSelection: vi.fn(),
		onOpenDetails: vi.fn(),
		onGoUp: vi.fn(),
		onDeleteSelected: vi.fn(),
		onSelectKeys: vi.fn(),
		onSetLastSelected: vi.fn(),
		onSelectRange: vi.fn(),
		onScrollToIndex: vi.fn(),
		onSelectAllLoaded: vi.fn(),
		onWarnRenameNoSelection: vi.fn(),
	}
}

describe('useObjectsListKeydown', () => {
	it('clears selection on Escape and warns when F2 is pressed without a single selection', () => {
		const args = createArgs()
		args.selectedCount = 2
		args.singleSelectedKey = null
		const { result } = renderHook(() => useObjectsListKeydown(args))

		const escapeEvent = createKeyboardEvent('Escape')
		act(() => {
			result.current(escapeEvent)
		})
		expect(escapeEvent.preventDefault).toHaveBeenCalledTimes(1)
		expect(args.onClearSelection).toHaveBeenCalledTimes(1)

		const renameEvent = createKeyboardEvent('F2')
		act(() => {
			result.current(renameEvent)
		})
		expect(renameEvent.preventDefault).toHaveBeenCalledTimes(1)
		expect(args.onWarnRenameNoSelection).toHaveBeenCalledTimes(1)
	})

	it('closes the context menu on Escape before clearing selection', () => {
		const args = createArgs()
		args.contextMenuOpen = true
		args.selectedCount = 2
		const { result } = renderHook(() => useObjectsListKeydown(args))

		const escapeEvent = createKeyboardEvent('Escape')
		act(() => {
			result.current(escapeEvent)
		})

		expect(escapeEvent.preventDefault).toHaveBeenCalledTimes(1)
		expect(args.onCloseContextMenu).toHaveBeenCalledTimes(1)
		expect(args.onClearSelection).not.toHaveBeenCalled()
	})

	it('extends the current selection with Shift+ArrowDown and scrolls to the new row', () => {
		const args = createArgs()
		const { result } = renderHook(() => useObjectsListKeydown(args))

		const event = createKeyboardEvent('ArrowDown', { shiftKey: true })
		act(() => {
			result.current(event)
		})

		expect(event.preventDefault).toHaveBeenCalledTimes(1)
		expect(args.onSelectRange).toHaveBeenCalledWith('docs/a.txt', 'docs/b.txt')
		expect(args.onScrollToIndex).toHaveBeenCalledWith(1)
		expect(args.onSelectKeys).not.toHaveBeenCalled()
	})

	it('selects all loaded items on Ctrl+A', () => {
		const args = createArgs()
		const { result } = renderHook(() => useObjectsListKeydown(args))

		const event = createKeyboardEvent('a', { ctrlKey: true })
		act(() => {
			result.current(event)
		})

		expect(event.preventDefault).toHaveBeenCalledTimes(1)
		expect(args.onSelectAllLoaded).toHaveBeenCalledTimes(1)
	})
})
