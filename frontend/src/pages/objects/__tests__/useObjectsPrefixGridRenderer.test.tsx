import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import styles from '../ObjectsGridCards.module.css'
import { useObjectsPrefixGridRenderer } from '../useObjectsPrefixGridRenderer'

function Harness(props: {
	dndHoverPrefix?: string | null
	onDragOver?: (prefix: string) => void
	onDragLeave?: (prefix: string) => void
	onDrop?: (prefix: string) => void
}) {
	const renderPrefixGridItem = useObjectsPrefixGridRenderer({
		canDragDrop: true,
		clearDndHover: vi.fn(),
		closeContextMenu: vi.fn(),
		contextMenuState: { open: false, kind: null, key: null, source: null },
		getPrefixActions: () => [],
		highlightText: (value) => value,
		isAdvanced: false,
		dndHoverPrefix: props.dndHoverPrefix ?? null,
		normalizeDropTargetPrefix: (raw) => raw,
		onOpenPrefix: vi.fn(),
		onDndTargetDragOver: (_event, prefix) => props.onDragOver?.(prefix),
		onDndTargetDragLeave: (_event, prefix) => props.onDragLeave?.(prefix),
		onDndTargetDrop: (_event, prefix) => props.onDrop?.(prefix),
		onRowDragStartPrefix: vi.fn(),
		openPrefixContextMenu: vi.fn(),
		prefix: '',
		recordContextMenuPoint: () => ({ x: 0, y: 0 }),
		withContextMenuClassName: (menu) => menu,
	})

	return <div>{renderPrefixGridItem('docs/')}</div>
}

describe('useObjectsPrefixGridRenderer', () => {
	it('wires folder cards as drop targets', () => {
		const onDragOver = vi.fn()
		const onDragLeave = vi.fn()
		const onDrop = vi.fn()

		render(<Harness onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} />)

		const target = screen.getByRole('button', { name: /docs\//i })
		fireEvent.dragOver(target)
		fireEvent.dragLeave(target)
		fireEvent.drop(target)

		expect(onDragOver).toHaveBeenCalledWith('docs/')
		expect(onDragLeave).toHaveBeenCalledWith('docs/')
		expect(onDrop).toHaveBeenCalledWith('docs/')
	})

	it('shows active drop styling for the hovered folder', () => {
		render(<Harness dndHoverPrefix="docs/" />)

		expect(screen.getByRole('button', { name: /docs\//i }).className).toContain(styles.gridCardDropActive)
	})
})
