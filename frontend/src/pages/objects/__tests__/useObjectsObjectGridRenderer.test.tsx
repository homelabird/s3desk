import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createThumbnailCache } from '../../../lib/thumbnailCache'
import { createMockApiClient } from '../../../test/mockApiClient'
import styles from '../ObjectsGridCards.module.css'
import { useObjectsObjectGridRenderer } from '../useObjectsObjectGridRenderer'

vi.mock('../ObjectThumbnailLazy', () => ({
	LazyObjectThumbnail: () => <div data-testid="grid-thumbnail">thumb</div>,
}))

function Harness(props: {
	onPreview?: (key: string) => void
	onSelect?: (key: string) => void
	onToggleFavorite?: (key: string) => void
	objectCrudSupported?: boolean
}) {
	const renderObjectGridItem = useObjectsObjectGridRenderer({
		api: createMockApiClient(),
		apiToken: 'token-a',
		profileId: 'profile-1',
		profileProvider: 's3_compatible',
		bucket: 'bucket-a',
		prefix: '',
		canDragDrop: false,
		isAdvanced: true,
		isOffline: false,
		objectCrudSupported: props.objectCrudSupported ?? true,
		showThumbnails: true,
		thumbnailCache: createThumbnailCache(),
		highlightText: (value) => value,
		contextMenuState: { open: false, kind: null, key: null, source: null },
		withContextMenuClassName: (menu) => menu,
		getObjectActions: () => [],
		selectionContextMenuActions: [],
		recordContextMenuPoint: () => ({ x: 0, y: 0 }),
		openObjectContextMenu: vi.fn(),
		closeContextMenu: vi.fn(),
		onOpenLargePreviewForKey: (key) => props.onPreview?.(key),
		onRowDragStartObjects: vi.fn(),
		clearDndHover: vi.fn(),
		selectObjectFromPointerEvent: (_event, key) => props.onSelect?.(key),
		selectObjectFromCheckboxEvent: vi.fn(),
		selectedCount: 1,
		selectedKeys: new Set(['preview.png']),
		favoriteKeys: new Set<string>(),
		favoritePendingKeys: new Set<string>(),
		toggleFavorite: (key) => props.onToggleFavorite?.(key),
	})

	return (
		<div>
			{renderObjectGridItem({
				key: 'preview.png',
				size: 2048,
				lastModified: '2024-01-01T00:00:00Z',
				etag: '"preview"',
			})}
		</div>
	)
}

describe('useObjectsObjectGridRenderer', () => {
	it('renders compact grid actions, exposes body selection, and keeps preview clicks isolated', () => {
		const onPreview = vi.fn()
		const onSelect = vi.fn()
		const onToggleFavorite = vi.fn()

		render(<Harness onPreview={onPreview} onSelect={onSelect} onToggleFavorite={onToggleFavorite} />)

		const cardTitle = screen.getByText('preview.png')
		const card = cardTitle.closest('[data-objects-row="true"]')
		expect(card).not.toBeNull()
		expect(screen.getByRole('group', { name: 'Object preview.png' })).toBe(card)
		expect(card).not.toHaveAttribute('aria-selected')
		expect(card?.className).toContain(styles.gridCardSelected)
		expect(screen.getByRole('checkbox', { name: 'Select preview.png' })).toBeChecked()
		expect(screen.getByTestId('grid-thumbnail')).toBeInTheDocument()

		const selectButton = screen.getByRole('button', { name: 'Select object preview.png' })
		const favoriteButton = screen.getByRole('button', { name: 'Add favorite for preview.png' })
		const objectActionsButton = screen.getByRole('button', { name: 'Object actions for preview.png' })
		const previewButton = screen.getByRole('button', { name: 'Open large preview for preview.png' })

		expect(selectButton.className).toContain(styles.gridCardBodyButton)
		expect(selectButton).toHaveAttribute('aria-pressed', 'true')
		expect(selectButton).toHaveTextContent('preview.png')
		expect(favoriteButton.className).toContain(styles.gridCardIconButton)
		expect(objectActionsButton.className).toContain(styles.gridCardIconButton)
		expect(previewButton.className).toContain(styles.gridCardPreviewActionButton)

		fireEvent.click(selectButton)
		expect(onSelect).toHaveBeenCalledWith('preview.png')
		onSelect.mockClear()

		fireEvent.click(previewButton)
		expect(onPreview).toHaveBeenCalledWith('preview.png')
		expect(onSelect).not.toHaveBeenCalled()

		fireEvent.click(favoriteButton)
		expect(onToggleFavorite).toHaveBeenCalledWith('preview.png')
		expect(onSelect).not.toHaveBeenCalled()

		fireEvent.keyDown(favoriteButton, { key: 'Enter' })
		fireEvent.keyDown(objectActionsButton, { key: ' ' })
		expect(onSelect).not.toHaveBeenCalled()
	})

	it('disables favorite actions when object CRUD is unsupported', () => {
		const onToggleFavorite = vi.fn()

		render(<Harness onToggleFavorite={onToggleFavorite} objectCrudSupported={false} />)

		const favoriteButton = screen.getByRole('button', { name: 'Add favorite for preview.png' })
		expect(favoriteButton).toBeDisabled()

		fireEvent.click(favoriteButton)
		expect(onToggleFavorite).not.toHaveBeenCalled()
	})
})
