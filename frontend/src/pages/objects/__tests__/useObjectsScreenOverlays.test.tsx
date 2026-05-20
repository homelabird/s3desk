import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectsScreenOverlays } from '../useObjectsScreenOverlays'

type UseObjectsScreenOverlaysArgs = Parameters<
	typeof import('../useObjectsScreenOverlays').useObjectsScreenOverlays
>[0]
type BuildObjectsPageOverlaysPropsArgs = Parameters<
	typeof import('../buildObjectsPageOverlaysProps').buildObjectsPageOverlaysProps
>[0]
type BuildObjectsPageOverlaysPropsResult = ReturnType<
	typeof import('../buildObjectsPageOverlaysProps').buildObjectsPageOverlaysProps
>
type RefCell = {
	current: unknown | null
}

function readRef<T>(ref: RefCell): T {
	return ref.current as T
}

const { overlaysArgsRef, overlaysResultRef } = vi.hoisted(
	(): Record<string, RefCell> => ({
		overlaysArgsRef: { current: null },
		overlaysResultRef: { current: null },
	}),
)

vi.mock('../buildObjectsPageOverlaysProps', () => ({
	buildObjectsPageOverlaysProps: (args: BuildObjectsPageOverlaysPropsArgs) => {
		overlaysArgsRef.current = args
		return readRef<BuildObjectsPageOverlaysPropsResult>(overlaysResultRef)
	},
}))

function seedOverlaysState() {
	const props = {
		apiToken: 'token-a',
		profileId: 'profile-1',
	}
	const data = {
		bucket: 'bucket-a',
			prefix: 'docs/',
			screens: { md: true, lg: true },
			bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
			bucketsQuery: { isFetching: true },
			selectedCount: 2,
			filtersDrawerOpen: true,
			setFiltersDrawerOpen: vi.fn(),
			isAdvanced: true,
			typeFilter: 'all',
			setTypeFilter: vi.fn(),
			favoritesOnly: false,
			setFavoritesOnly: vi.fn(),
			favoritesFirst: true,
			setFavoritesFirst: vi.fn(),
			extFilter: 'pdf',
			extOptions: ['pdf'],
			setExtFilter: vi.fn(),
			minSize: 10,
			maxSize: 1000,
			setMinSize: vi.fn(),
			setMaxSize: vi.fn(),
			minModifiedMs: 100,
			maxModifiedMs: 200,
			setMinModifiedMs: vi.fn(),
			setMaxModifiedMs: vi.fn(),
			sort: 'name_asc',
			setSort: vi.fn(),
			pathModalOpen: false,
			pathDraft: 'docs/',
			pathOptions: [{ value: 'docs/' }],
			pathInputRef: { current: null },
			setPathDraft: vi.fn(),
			commitPathDraft: vi.fn(),
			setPathModalOpen: vi.fn(),
			globalSearchOpen: true,
			closeGlobalSearch: vi.fn(),
			globalSearchDraft: 'report',
			setGlobalSearchDraft: vi.fn(),
			globalSearchPrefix: 'docs',
			setGlobalSearchPrefix: vi.fn(),
			globalSearchLimitClamped: 25,
			setGlobalSearchLimit: vi.fn(),
			globalSearchExt: 'pdf',
			setGlobalSearchExt: vi.fn(),
			globalSearchMinSize: 10,
			setGlobalSearchMinSize: vi.fn(),
			globalSearchMaxSize: 1000,
			setGlobalSearchMaxSize: vi.fn(),
			globalSearchMinModifiedMs: 100,
			setGlobalSearchMinModifiedMs: vi.fn(),
			globalSearchMaxModifiedMs: 200,
			setGlobalSearchMaxModifiedMs: vi.fn(),
			resetGlobalSearch: vi.fn(),
			indexedSearchQuery: 'annual',
			indexedSearchNotIndexed: false,
			indexedSearchErrorMessage: '',
			indexedSearchItems: [{ key: 'docs/report.pdf' }],
			indexObjectsJobMutation: { isPending: false },
			indexPrefix: 'docs/',
			setIndexPrefix: vi.fn(),
			indexFullReindex: false,
			setIndexFullReindex: vi.fn(),
			globalSearchQueryText: 'annual',
		onOpenPrefix: vi.fn(),
	}
	const args = {
		props,
		locationVm: data,
		listVm: data,
		selectionVm: data,
		operationVm: data,
		paneVm: data,
		actions: {
			tag: 'actions',
		} as unknown as UseObjectsScreenOverlaysArgs['actions'],
		listState: {
			resetFilters: vi.fn(),
			hasActiveView: true,
			commandPaletteOpen: true,
			commandPaletteQuery: 'rep',
			commandPaletteItems: [{ id: 'open' }],
			commandPaletteActiveIndex: 0,
			onCommandPaletteQueryChange: vi.fn(),
			setCommandPaletteActiveIndex: vi.fn(),
			runCommandPaletteItem: vi.fn(),
			closeCommandPalette: vi.fn(),
			onCommandPaletteKeyDown: vi.fn(),
			onCopy: vi.fn(),
			onDownload: vi.fn(),
			openGlobalSearchPrefix: vi.fn(),
			openGlobalSearchDetails: vi.fn(),
		} as unknown as UseObjectsScreenOverlaysArgs['listState'],
	} as unknown as UseObjectsScreenOverlaysArgs

	overlaysResultRef.current = {
		tag: 'overlays-props',
	} as unknown as BuildObjectsPageOverlaysPropsResult

	return { args }
}

describe('useObjectsScreenOverlays', () => {
	beforeEach(() => {
		overlaysArgsRef.current = null
		overlaysResultRef.current = null
	})

	it('maps screen, data, action, and list state into overlay builder args', () => {
		const { args } = seedOverlaysState()

		const { result } = renderHook(() => useObjectsScreenOverlays(args))

		expect(readRef<BuildObjectsPageOverlaysPropsArgs>(overlaysArgsRef)).toEqual({
			actions: args.actions,
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			isMd: true,
			isLg: true,
			bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
			bucketsLoading: true,
			selectedCount: 2,
			filtersDrawerOpen: true,
			setFiltersDrawerOpen: args.paneVm.setFiltersDrawerOpen,
			isAdvanced: true,
			typeFilter: 'all',
			setTypeFilter: args.listVm.setTypeFilter,
			favoritesOnly: false,
			setFavoritesOnly: args.listVm.setFavoritesOnly,
			favoritesFirst: true,
			setFavoritesFirst: args.listVm.setFavoritesFirst,
			extFilter: 'pdf',
			extOptions: ['pdf'],
			setExtFilter: args.listVm.setExtFilter,
			minSize: 10,
			maxSize: 1000,
			setMinSize: args.listVm.setMinSize,
			setMaxSize: args.listVm.setMaxSize,
			minModifiedMs: 100,
			maxModifiedMs: 200,
			setMinModifiedMs: args.listVm.setMinModifiedMs,
			setMaxModifiedMs: args.listVm.setMaxModifiedMs,
			sort: 'name_asc',
			setSort: args.listVm.setSort,
			resetFilters: args.listState.resetFilters,
			hasActiveView: true,
			pathModalOpen: false,
			pathDraft: 'docs/',
			pathOptions: [{ value: 'docs/' }],
			pathInputRef: { current: null },
			setPathDraft: args.locationVm.setPathDraft,
			commitPathDraft: args.locationVm.commitPathDraft,
			setPathModalOpen: args.locationVm.setPathModalOpen,
			commandPaletteOpen: true,
			commandPaletteQuery: 'rep',
			commandPaletteItems: [{ id: 'open' }],
			commandPaletteActiveIndex: 0,
			onCommandPaletteQueryChange: args.listState.onCommandPaletteQueryChange,
			setCommandPaletteActiveIndex: args.listState.setCommandPaletteActiveIndex,
			runCommandPaletteItem: args.listState.runCommandPaletteItem,
			closeCommandPalette: args.listState.closeCommandPalette,
			onCommandPaletteKeyDown: args.listState.onCommandPaletteKeyDown,
			globalSearchOpen: true,
			closeGlobalSearch: args.paneVm.closeGlobalSearch,
			globalSearchDraft: 'report',
			setGlobalSearchDraft: args.paneVm.setGlobalSearchDraft,
			globalSearchPrefix: 'docs',
			setGlobalSearchPrefix: args.paneVm.setGlobalSearchPrefix,
			globalSearchLimitClamped: 25,
			setGlobalSearchLimit: args.paneVm.setGlobalSearchLimit,
			globalSearchExt: 'pdf',
			setGlobalSearchExt: args.paneVm.setGlobalSearchExt,
			globalSearchMinSize: 10,
			setGlobalSearchMinSize: args.paneVm.setGlobalSearchMinSize,
			globalSearchMaxSize: 1000,
			setGlobalSearchMaxSize: args.paneVm.setGlobalSearchMaxSize,
			globalSearchMinModifiedMs: 100,
			setGlobalSearchMinModifiedMs: args.paneVm.setGlobalSearchMinModifiedMs,
			globalSearchMaxModifiedMs: 200,
			setGlobalSearchMaxModifiedMs: args.paneVm.setGlobalSearchMaxModifiedMs,
			resetGlobalSearch: args.paneVm.resetGlobalSearch,
			indexedSearchQuery: 'annual',
			indexedSearchNotIndexed: false,
			indexedSearchErrorMessage: '',
			indexedSearchItems: [{ key: 'docs/report.pdf' }],
			indexObjectsJobMutation: { isPending: false },
			indexPrefix: 'docs/',
			setIndexPrefix: args.paneVm.setIndexPrefix,
			indexFullReindex: false,
			setIndexFullReindex: args.paneVm.setIndexFullReindex,
			globalSearchQueryText: 'annual',
			onOpenPrefix: args.locationVm.onOpenPrefix,
			onCopy: args.listState.onCopy,
			onDownload: args.listState.onDownload,
			openGlobalSearchPrefix: args.listState.openGlobalSearchPrefix,
			openGlobalSearchDetails: args.listState.openGlobalSearchDetails,
		})
		expect(result.current).toEqual({ tag: 'overlays-props' })
	})
})
