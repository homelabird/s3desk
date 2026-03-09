import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

		expect(screen.getByTestId('objects-favorites-pane')).toHaveAttribute('data-expanded', 'false')
		expect(screen.queryByPlaceholderText('Find favorite…')).not.toBeInTheDocument()
		expect(screen.queryByText('No favorites yet.')).not.toBeInTheDocument()
		expect(screen.getByTestId('objects-folders-pane')).toBeInTheDocument()
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
		expect(screen.getByText('No favorites yet.')).toBeInTheDocument()
		expect(screen.getByText('Star objects from the list to pin quick paths here.')).toBeInTheDocument()
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
})
