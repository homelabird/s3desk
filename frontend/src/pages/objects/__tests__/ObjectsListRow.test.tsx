import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import styles from '../ObjectsListView.module.css'
import { ObjectsObjectRow, ObjectsPrefixRow } from '../ObjectsListRow'

const originalResizeObserver = globalThis.ResizeObserver

describe('ObjectsListRow', () => {
	beforeEach(() => {
		globalThis.ResizeObserver = class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as typeof ResizeObserver
	})

	afterEach(() => {
		globalThis.ResizeObserver = originalResizeObserver
		vi.restoreAllMocks()
	})

	it('renders compact object rows with selection styling and isolated favorite actions', () => {
		const onClick = vi.fn()
		const onToggleFavorite = vi.fn()

		render(
			<ObjectsObjectRow
				offset={24}
				rowMinHeight={44}
				listGridClassName={styles.listGridCompact}
				isCompact
				canDragDrop={false}
				objectKey="photos/cat.png"
				displayName="cat.png"
				sizeLabel="1.2 MB"
				timeLabel="2026-03-07 20:00"
				isSelected
				isFavorite={false}
				highlightText={(value) => value}
				menu={{ items: [{ key: 'remove', label: 'Remove' }] }}
				buttonMenuOpen={false}
				onButtonMenuOpenChange={vi.fn()}
				onClick={onClick}
				onContextMenu={vi.fn()}
				onCheckboxClick={vi.fn()}
				onDragStart={vi.fn()}
				onDragEnd={vi.fn()}
				onToggleFavorite={onToggleFavorite}
				thumbnail={<span data-testid="row-thumbnail">thumb</span>}
			/>,
		)

		expect(screen.getByText('1.2 MB · 2026-03-07 20:00')).toBeInTheDocument()
		expect(screen.getByTestId('row-thumbnail')).toBeInTheDocument()

		const row = screen.getByRole('listitem')
		expect(row.className).toContain(styles.listRowSelected)

		fireEvent.click(screen.getByLabelText('Add favorite'))
		expect(onToggleFavorite).toHaveBeenCalledTimes(1)
		expect(onClick).not.toHaveBeenCalled()

		fireEvent.click(screen.getByText('cat.png'))
		expect(onClick).toHaveBeenCalledTimes(1)
	})

	it('opens prefix rows on keyboard activation', () => {
		const onOpen = vi.fn()
		const onDropTargetDragOver = vi.fn()
		const onDropTargetDragLeave = vi.fn()
		const onDropTargetDrop = vi.fn()

		render(
			<ObjectsPrefixRow
				prefixKey="archive/"
				offset={0}
				rowMinHeight={40}
				listGridClassName={styles.listGridCompact}
				isCompact
				canDragDrop={false}
				displayName="archive/"
				highlightText={(value) => value}
				menu={{ items: [{ key: 'open', label: 'Open' }] }}
				buttonMenuOpen={false}
				onButtonMenuOpenChange={vi.fn()}
				onContextMenu={vi.fn()}
				onOpen={onOpen}
				onDragStart={vi.fn()}
				onDragEnd={vi.fn()}
				isDropTargetActive
				onDropTargetDragOver={onDropTargetDragOver}
				onDropTargetDragLeave={onDropTargetDragLeave}
				onDropTargetDrop={onDropTargetDrop}
			/>,
		)

		const row = screen.getByRole('button', { name: /archive\//i })
		expect(row.className).toContain(styles.listRowDropActive)
		fireEvent.dragOver(row)
		fireEvent.dragLeave(row)
		fireEvent.drop(row)
		fireEvent.keyDown(row, { key: 'Enter' })

		expect(onDropTargetDragOver).toHaveBeenCalledTimes(1)
		expect(onDropTargetDragLeave).toHaveBeenCalledTimes(1)
		expect(onDropTargetDrop).toHaveBeenCalledTimes(1)
		expect(onOpen).toHaveBeenCalledTimes(1)
	})
})
