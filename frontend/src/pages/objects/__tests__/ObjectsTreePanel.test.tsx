import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	failedToLoadFavoritesTitle,
	loadingFavoritesCountLabel,
	newFolderShortcutHint,
	noFavoritesYetTitle,
	starObjectsToKeepThemHereHint,
} from '../../../lib/actionHints'
import { ObjectsTreePanel } from '../ObjectsTreePanel'

function buildProps(overrides: Partial<ComponentProps<typeof ObjectsTreePanel>> = {}): ComponentProps<typeof ObjectsTreePanel> {
	return {
		dockTree: true,
		treeDrawerOpen: false,
		hasProfile: true,
		hasBucket: true,
		favorites: [],
		favoriteCount: 0,
		favoritesSearch: '',
		onFavoritesSearchChange: vi.fn(),
		favoritesOnly: false,
		onFavoritesOnlyChange: vi.fn(),
		favoritesOpenDetails: false,
		onFavoritesOpenDetailsChange: vi.fn(),
		favoritesExpanded: false,
		onFavoritesExpandedChange: vi.fn(),
		onSelectFavorite: vi.fn(),
		onSelectFavoriteFromDrawer: vi.fn(),
		favoritesLoading: false,
		favoritesError: null,
		treeData: [
			{
				key: '/',
				title: 'bucket-a',
				isLeaf: false,
				children: [],
			},
		],
		treeError: null,
		loadingKeys: [],
		expandedKeys: [],
		selectedKeys: ['/'],
		onExpandedKeysChange: vi.fn(),
		onSelectKey: vi.fn(),
		onSelectKeyFromDrawer: vi.fn(),
		onLoadData: vi.fn(async () => {}),
		getDropTargetPrefix: vi.fn(() => '/'),
		canDragDrop: false,
		dndHoverPrefix: null,
		onDndTargetDragOver: vi.fn(),
		onDndTargetDragLeave: vi.fn(),
		onDndTargetDrop: vi.fn(),
		onResizePointerDown: vi.fn(),
		onResizePointerMove: vi.fn(),
		onResizePointerUp: vi.fn(),
		onResizeKeyDown: vi.fn(),
		resizeMinWidth: 220,
		resizeMaxWidth: 720,
		resizeValue: 280,
		canCreateFolder: true,
		createFolderTooltipText: '',
		onNewFolderAtPrefix: vi.fn(),
		onPrefixContextMenu: vi.fn(),
		onCloseDrawer: vi.fn(),
		...overrides,
	}
}

describe('ObjectsTreePanel', () => {
	beforeEach(() => {
		window.localStorage.clear()
	})

	it('collapses the favorites pane by default when there are no favorites yet', () => {
		render(<ObjectsTreePanel {...buildProps()} />)

		expect(screen.getByTestId('objects-tree-content')).toBeInTheDocument()
		expect(screen.getByTestId('objects-favorites-pane')).toHaveAttribute('data-expanded', 'false')
		expect(screen.queryByPlaceholderText('Find favorite…')).not.toBeInTheDocument()
		expect(screen.queryByText(noFavoritesYetTitle())).not.toBeInTheDocument()
		expect(screen.getByTestId('objects-folders-pane')).toBeInTheDocument()
		expect(screen.getByTestId('objects-folders-pane-header')).toBeInTheDocument()
		expect(screen.getByTestId('objects-folders-pane-body')).toBeInTheDocument()
	})

	it('uses the stable tree drawer id when rendered as a sheet', () => {
		render(<ObjectsTreePanel {...buildProps({ dockTree: false, treeDrawerOpen: true })} />)

		expect(screen.getByRole('dialog', { name: 'Browse' })).toHaveAttribute('id', 'objects-tree-drawer')
	})

	it('lets users expand the empty favorites pane on demand', () => {
		const onFavoritesExpandedChange = vi.fn()
		const { rerender } = render(
			<ObjectsTreePanel {...buildProps({ onFavoritesExpandedChange, favoritesExpanded: false })} />,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Favorites' }))
		expect(onFavoritesExpandedChange).toHaveBeenCalledWith(true)

		rerender(<ObjectsTreePanel {...buildProps({ onFavoritesExpandedChange, favoritesExpanded: true })} />)

		expect(screen.getByTestId('objects-favorites-pane')).toHaveAttribute('data-expanded', 'true')
		expect(screen.getByTestId('objects-favorites-status')).toHaveAttribute('data-favorites-status-kind', 'empty')
		expect(screen.getByText(noFavoritesYetTitle())).toBeInTheDocument()
		expect(screen.getByText(starObjectsToKeepThemHereHint())).toBeInTheDocument()
	})

	it('keeps the favorites pane collapsed by default while the header badge announces loading', () => {
		render(<ObjectsTreePanel {...buildProps({ favoritesLoading: true })} />)

		expect(screen.getByTestId('objects-favorites-pane')).toHaveAttribute('data-expanded', 'false')
		expect(screen.getByTestId('objects-favorites-badge')).toHaveAttribute('aria-label', loadingFavoritesCountLabel())
		expect(screen.queryByTestId('objects-favorites-status')).not.toBeInTheDocument()
	})

	it('keeps the favorites pane collapsed by default while the header badge announces initial load errors', () => {
		render(<ObjectsTreePanel {...buildProps({ favoritesError: 'favorites backend unavailable' })} />)

		expect(screen.getByTestId('objects-favorites-pane')).toHaveAttribute('data-expanded', 'false')
		expect(screen.getByTestId('objects-favorites-badge')).toHaveAttribute('aria-label', failedToLoadFavoritesTitle())
		expect(screen.queryByTestId('objects-favorites-status')).not.toBeInTheDocument()
	})

	it('shows the favorite count without auto-expanding when pinned items exist', () => {
		const { rerender } = render(<ObjectsTreePanel {...buildProps()} />)

		rerender(
			<ObjectsTreePanel
				{...buildProps({
					favorites: [
						{
							key: 'docs/readme.txt',
							size: 128,
							lastModified: '2026-03-09T00:00:00Z',
							storageClass: 'STANDARD',
							etag: 'etag-1',
							createdAt: '2026-03-09T00:00:00Z',
						},
					],
					favoriteCount: 1,
				})}
			/>,
		)

		expect(screen.getByTestId('objects-favorites-pane')).toHaveAttribute('data-expanded', 'false')
		expect(screen.getByText('1')).toBeInTheDocument()
		expect(screen.queryByTestId('objects-favorite-item')).not.toBeInTheDocument()
	})

	it('keeps active favorites filters collapsed and summarizes them in the header', () => {
		render(
			<ObjectsTreePanel
				{...buildProps({
					favoritesSearch: 'report',
					favoritesOnly: true,
					favorites: [
						{
							key: 'reports/summary.txt',
							size: 128,
							lastModified: '2026-03-09T00:00:00Z',
							storageClass: 'STANDARD',
							etag: 'etag-1',
							createdAt: '2026-03-09T00:00:00Z',
						},
					],
					favoriteCount: 1,
				})}
			/>,
		)

		expect(screen.getByTestId('objects-favorites-pane')).toHaveAttribute('data-expanded', 'false')
		expect(screen.getByTestId('objects-favorites-summary')).toHaveTextContent('Only · "report"')
		expect(screen.queryByTestId('objects-favorites-controls')).not.toBeInTheDocument()
		expect(screen.queryByTestId('objects-favorite-item')).not.toBeInTheDocument()
	})

	it('renders the favorites controls when pinned items are expanded', () => {
		render(
			<ObjectsTreePanel
				{...buildProps({
					favorites: [
						{
							key: 'docs/readme.txt',
							size: 128,
							lastModified: '2026-03-09T00:00:00Z',
							storageClass: 'STANDARD',
							etag: 'etag-1',
							createdAt: '2026-03-09T00:00:00Z',
						},
					],
					favoriteCount: 1,
					favoritesExpanded: true,
				})}
			/>,
		)

		expect(screen.getByTestId('objects-favorites-controls')).toBeInTheDocument()
		expect(screen.getByText('Favorites only')).toBeInTheDocument()
		expect(screen.getByText('Open details on click')).toBeInTheDocument()
	})

	it('uses the shared new-folder shortcut tooltip at the root level', () => {
		render(<ObjectsTreePanel {...buildProps({ canCreateFolder: true, selectedKeys: ['/'] })} />)

		expect(screen.getByTitle(newFolderShortcutHint())).toBeInTheDocument()
	})

	it('exposes the docked tree resize handle as a keyboard separator', () => {
		const onResizeKeyDown = vi.fn()
		render(<ObjectsTreePanel {...buildProps({ onResizeKeyDown, resizeValue: 312 })} />)

		const separator = screen.getByRole('separator', { name: 'Resize folder pane' })
		expect(separator).toHaveAttribute('aria-orientation', 'vertical')
		expect(separator).toHaveAttribute('aria-valuemin', '220')
		expect(separator).toHaveAttribute('aria-valuemax', '720')
		expect(separator).toHaveAttribute('aria-valuenow', '312')

		fireEvent.keyDown(separator, { key: 'ArrowRight' })
		expect(onResizeKeyDown).toHaveBeenCalledTimes(1)
	})
})
