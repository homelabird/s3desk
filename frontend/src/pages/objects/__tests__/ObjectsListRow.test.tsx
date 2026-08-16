import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import styles from '../ObjectsListView.module.css'
import { ObjectsListHeader } from '../ObjectsListHeader'
import { ObjectsObjectRow, ObjectsParentRow, ObjectsPrefixRow } from '../ObjectsListRow'

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
		expect(screen.getByRole('button', { name: 'Select object cat.png' })).toHaveAttribute('aria-pressed', 'true')
		expect(screen.getByLabelText('Add favorite for cat.png').className).toContain(styles.listRowIconButton)
		expect(screen.getByLabelText('Object actions for cat.png').className).toContain(styles.listRowIconButton)

		fireEvent.click(screen.getByLabelText('Add favorite for cat.png'))
		expect(onToggleFavorite).toHaveBeenCalledTimes(1)
		expect(onClick).not.toHaveBeenCalled()

		fireEvent.click(screen.getByText('cat.png'))
		expect(onClick).toHaveBeenCalledTimes(1)
	})

	it('keeps sort direction explicit while decorative header icons stay out of the accessible name', () => {
		const onToggleSort = vi.fn()

		render(
			<ObjectsListHeader
				isCompact
				listGridClassName={styles.listGridCompact}
				allLoadedSelected={false}
				someLoadedSelected={false}
				hasRows
				onToggleSelectAll={vi.fn()}
				sortDirForColumn={(column) => (column === 'name' ? 'asc' : null)}
				onToggleSort={onToggleSort}
			/>,
		)

		const sortButton = screen.getByRole('button', { name: 'Sort by Name, currently ascending' })
		expect(screen.queryByRole('img', { name: 'arrow-up' })).not.toBeInTheDocument()
		fireEvent.click(sortButton)
		expect(onToggleSort).toHaveBeenCalledWith('name')
	})

	it('keeps wide object rows on a five-column contract when preview actions are present', () => {
		render(
			<ObjectsObjectRow
				offset={12}
				rowMinHeight={72}
				listGridClassName={styles.listGridWide}
				isCompact={false}
				canDragDrop={false}
				objectKey="photos/cat.png"
				displayName="cat.png"
				sizeLabel="1.2 MB"
				timeLabel="2026-03-07 20:00"
				isSelected={false}
				isFavorite={false}
				highlightText={(value) => value}
				menu={{ items: [{ key: 'remove', label: 'Remove' }] }}
				buttonMenuOpen={false}
				onButtonMenuOpenChange={vi.fn()}
				onClick={vi.fn()}
				onContextMenu={vi.fn()}
				onCheckboxClick={vi.fn()}
				onDragStart={vi.fn()}
				onDragEnd={vi.fn()}
				onToggleFavorite={vi.fn()}
				thumbnail={<span data-testid="row-thumbnail">thumb</span>}
				previewAction={<button type="button">Preview</button>}
			/>,
		)

		const row = screen.getByText('cat.png').closest('[data-objects-row="true"]')
		expect(row).not.toBeNull()
		expect(row?.children).toHaveLength(5)
		expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
		expect(screen.getByLabelText('Object actions for cat.png')).toBeInTheDocument()
	})

	it('keeps nested object row controls from triggering row activation', () => {
		const onClick = vi.fn()
		const onCheckboxClick = vi.fn()
		const onToggleFavorite = vi.fn()

		render(
			<ObjectsObjectRow
				offset={12}
				rowMinHeight={72}
				listGridClassName={styles.listGridWide}
				isCompact={false}
				canDragDrop={false}
				objectKey="photos/cat.png"
				displayName="cat.png"
				sizeLabel="1.2 MB"
				timeLabel="2026-03-07 20:00"
				isSelected={false}
				isFavorite={false}
				highlightText={(value) => value}
				menu={{ items: [{ key: 'remove', label: 'Remove' }] }}
				buttonMenuOpen={false}
				onButtonMenuOpenChange={vi.fn()}
				onClick={onClick}
				onContextMenu={vi.fn()}
				onCheckboxClick={onCheckboxClick}
				onDragStart={vi.fn()}
				onDragEnd={vi.fn()}
				onToggleFavorite={onToggleFavorite}
				previewAction={<button type="button">Preview</button>}
			/>,
		)

		const row = screen.getByText('cat.png').closest('[data-objects-row="true"]')
		expect(row).not.toBeNull()
		expect(row).not.toHaveAttribute('role', 'button')
		expect(row).not.toHaveAttribute('tabindex')

		fireEvent.keyDown(screen.getByLabelText('Select cat.png'), { key: ' ' })
		fireEvent.keyDown(screen.getByLabelText('Add favorite for cat.png'), { key: 'Enter' })
		fireEvent.keyDown(screen.getByRole('button', { name: 'Preview' }), { key: 'Enter' })
		fireEvent.keyDown(screen.getByLabelText('Object actions for cat.png'), { key: ' ' })
		expect(onClick).not.toHaveBeenCalled()

		const rowButton = screen.getByRole('button', { name: 'Select object cat.png' })
		expect(rowButton).toHaveAttribute('aria-pressed', 'false')
		expect(rowButton.querySelector(`.${styles.listRowFileIconWrap}`)).toBeInTheDocument()
		fireEvent.click(rowButton)
		expect(onClick).toHaveBeenCalledTimes(1)
		expect(onCheckboxClick).not.toHaveBeenCalled()
		expect(onToggleFavorite).not.toHaveBeenCalled()
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

		const row = screen.getByTestId('objects-prefix-drop-target-archive%2F')
		const bodyButton = screen.getByRole('button', { name: 'Open prefix archive/' })
		expect(bodyButton.querySelector(`.${styles.listRowFolderIconWrap}`)).toBeInTheDocument()
		expect(row).not.toHaveAttribute('role', 'button')
		expect(row).not.toHaveAttribute('tabindex')
		expect(row.className).toContain(styles.listRowDropActive)
		fireEvent.dragOver(row)
		fireEvent.dragLeave(row)
		fireEvent.drop(row)
		fireEvent.click(bodyButton)

		expect(onDropTargetDragOver).toHaveBeenCalledTimes(1)
		expect(onDropTargetDragLeave).toHaveBeenCalledTimes(1)
		expect(onDropTargetDrop).toHaveBeenCalledTimes(1)
		expect(onOpen).toHaveBeenCalledTimes(1)
	})

	it('renders parent navigation without object actions', () => {
		const onOpen = vi.fn()
		render(
			<ObjectsParentRow
				offset={0}
				rowMinHeight={72}
				listGridClassName={styles.listGridWide}
				isCompact={false}
				onOpen={onOpen}
			/>,
		)

		const row = screen.getByTestId('objects-parent-row')
		expect(row.children).toHaveLength(5)
		expect(screen.getByText('../')).toBeInTheDocument()
		expect(screen.queryByLabelText(/actions/i)).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole('button', { name: 'Open parent folder' }))
		expect(onOpen).toHaveBeenCalledTimes(1)
	})
})
