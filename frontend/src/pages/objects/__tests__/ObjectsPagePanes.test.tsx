import { act, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ObjectsPagePanes } from '../ObjectsPagePanes'

vi.mock('../objectsPageLazy', () => ({
	ObjectsContextMenuPortal: () => <div data-testid="objects-context-menu-portal">context-menu</div>,
	ObjectsTreeSection: () => <div data-testid="objects-tree-section">tree</div>,
	ObjectsListControls: () => <div data-testid="objects-list-controls">controls</div>,
	ObjectsListContent: () => <div data-testid="objects-list-content">content</div>,
	ObjectsDetailsPanelSection: () => <div data-testid="objects-details-section">details</div>,
}))

function buildProps(overrides: Partial<ComponentProps<typeof ObjectsPagePanes>> = {}): ComponentProps<typeof ObjectsPagePanes> {
	return {
		layoutRef: { current: null },
		layoutProps: {
			treeWidthPx: 0,
			treeHandleWidthPx: 12,
			detailsWidthPx: 0,
			detailsHandleWidthPx: 0,
			treeDocked: false,
			detailsDocked: false,
			detailsOpen: false,
		},
		treeProps: {
			dockTree: false,
			treeDrawerOpen: false,
			hasProfile: true,
			hasBucket: true,
			favorites: [],
			favoritesSearch: '',
			onFavoritesSearchChange: () => {},
			favoritesOnly: false,
			onFavoritesOnlyChange: () => {},
			favoritesOpenDetails: false,
			onFavoritesOpenDetailsChange: () => {},
			onSelectFavorite: () => {},
			onSelectFavoriteFromDrawer: () => {},
			favoritesLoading: false,
			favoritesError: null,
			treeData: [],
			loadingKeys: [],
			onLoadData: async () => {},
			selectedKeys: [],
			expandedKeys: [],
			onExpandedKeysChange: () => {},
			onSelectKey: () => {},
			onSelectKeyFromDrawer: () => {},
			getDropTargetPrefix: () => '/',
			canDragDrop: false,
			dndHoverPrefix: null,
			onDndTargetDragOver: () => {},
			onDndTargetDragLeave: () => {},
			onDndTargetDrop: () => {},
			onResizePointerDown: () => {},
			onResizePointerMove: () => {},
			onResizePointerUp: () => {},
			canCreateFolder: false,
			createFolderTooltipText: '',
			onNewFolderAtPrefix: () => {},
			onPrefixContextMenu: () => {},
			onCloseDrawer: () => {},
		},
		contextMenuPortalProps: {
			contextMenuClassName: '',
			contextMenuRef: { current: null },
			contextMenuVisible: false,
			contextMenuProps: null,
			contextMenuStyle: null,
		},
		listProps: {
			controlsProps: {
				bucket: 'bucket-a',
				prefix: '',
				breadcrumbItems: [],
				isBookmarked: false,
				onToggleBookmark: () => {},
				onOpenPath: () => {},
				isCompact: false,
				searchDraft: '',
				onSearchDraftChange: () => {},
				hasActiveView: false,
				onOpenFilters: () => {},
				isAdvanced: true,
				visiblePrefixCount: 0,
				visibleFileCount: 0,
				search: '',
				hasNextPage: false,
				isFetchingNextPage: false,
				rawTotalCount: 0,
				searchAutoScanCap: 1000,
				onOpenGlobalSearch: () => {},
				canInteract: true,
				favoritesOnly: false,
				sort: 'name_asc',
				sortOptions: [{ label: 'Name (A -> Z)', value: 'name_asc' }],
				onSortChange: () => {},
				favoritesFirst: false,
				onFavoritesFirstChange: () => {},
				viewMode: 'list',
				onViewModeChange: () => {},
			},
			isOffline: false,
			favoritesOnly: false,
			favoritesErrorMessage: null,
			objectsErrorMessage: null,
			hasBucket: false,
			uploadDropActive: false,
			uploadDropLabel: 's3://bucket-a/',
			onUploadDragEnter: () => {},
			onUploadDragLeave: () => {},
			onUploadDragOver: () => {},
			onUploadDrop: () => {},
			selectionBarProps: {
				selectedCount: 0,
				singleSelectedKey: null,
				singleSelectedSize: undefined,
				isAdvanced: true,
				clearAction: undefined,
				deleteAction: undefined,
				downloadAction: undefined,
				selectionMenuActions: [],
				getObjectActions: () => [],
				isDownloadLoading: false,
				isDeleteLoading: false,
			},
			listHeaderProps: {
				isCompact: false,
				listGridClassName: '',
				allLoadedSelected: false,
				someLoadedSelected: false,
				hasRows: false,
				onToggleSelectAll: () => {},
				sortDirForColumn: () => null,
				onToggleSort: () => {},
			},
			listScrollerRef: { current: null },
			listScrollerTabIndex: 0,
			onListScrollerClick: () => {},
			onListScrollerKeyDown: () => {},
			onListScrollerScroll: () => {},
			onListScrollerWheel: () => {},
			onListScrollerContextMenu: () => {},
			contentProps: {
				rows: [],
				virtualItems: [],
				totalSize: 0,
				hasProfile: true,
				hasBucket: true,
				isFetching: false,
				isFetchingNextPage: false,
				emptyKind: 'empty',
				canClearSearch: false,
				onClearSearch: () => {},
				viewMode: 'list',
				renderPrefixRow: () => null,
				renderObjectRow: () => null,
				renderPrefixGridItem: () => null,
				renderObjectGridItem: () => null,
				showLoadMore: false,
				loadMoreLabel: '',
				loadMoreDisabled: false,
				onLoadMore: () => {},
			},
		},
		detailsProps: {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			isAdvanced: true,
			selectedCount: 0,
			detailsKey: null,
			detailsMeta: null,
			isMetaFetching: false,
			isMetaError: false,
			metaErrorMessage: '',
			onRetryMeta: () => {},
			onCopyKey: () => {},
			onDownload: () => {},
			onPresign: () => {},
			isPresignLoading: false,
			onCopyMove: () => {},
			onDelete: () => {},
			isDeleteLoading: false,
			thumbnail: null,
			preview: null,
			onLoadPreview: () => {},
			onCancelPreview: () => {},
			canCancelPreview: false,
			onOpenLargePreview: () => {},
			dockDetails: false,
			detailsOpen: false,
			detailsDrawerOpen: false,
			onOpenDetails: () => {},
			onCloseDetails: () => {},
			onCloseDrawer: () => {},
			onResizePointerDown: () => {},
			onResizePointerMove: () => {},
			onResizePointerUp: () => {},
		},
		...overrides,
	}
}

describe('ObjectsPagePanes', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		act(() => {
			vi.runOnlyPendingTimers()
		})
		vi.useRealTimers()
	})

	it('does not mount hidden tree or details panes', () => {
		render(<ObjectsPagePanes {...buildProps()} />)

		expect(screen.queryByTestId('objects-tree-section')).not.toBeInTheDocument()
		expect(screen.queryByTestId('objects-details-section')).not.toBeInTheDocument()
		expect(screen.getByTestId('objects-list-content')).toBeInTheDocument()
	})

	it('renders a collapsed details affordance without loading the details section', () => {
		render(
			<ObjectsPagePanes
				{...buildProps({
					layoutProps: {
						treeWidthPx: 0,
						treeHandleWidthPx: 12,
						detailsWidthPx: 36,
						detailsHandleWidthPx: 0,
						treeDocked: false,
						detailsDocked: true,
						detailsOpen: false,
					},
					detailsProps: {
						...buildProps().detailsProps,
						dockDetails: true,
						detailsOpen: false,
					},
				})}
			/>,
		)

		expect(screen.queryByTestId('objects-details-section')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument()
	})

	it('defers list controls until the idle tick after a bucket is available', async () => {
		render(
			<ObjectsPagePanes
				{...buildProps({
					listProps: {
						...buildProps().listProps,
						hasBucket: true,
					},
				})}
			/>,
		)

		expect(screen.queryByTestId('objects-list-controls')).not.toBeInTheDocument()
		expect(screen.getAllByText('Loading controls…')).not.toHaveLength(0)

		await act(async () => {
			vi.runAllTimers()
		})

		expect(screen.getByTestId('objects-list-controls')).toBeInTheDocument()
	})
})
