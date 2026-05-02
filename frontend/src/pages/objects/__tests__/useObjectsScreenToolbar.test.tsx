import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectsScreenToolbar } from '../useObjectsScreenToolbar'

type UseObjectsScreenToolbarArgs = Parameters<
	typeof import('../useObjectsScreenToolbar').useObjectsScreenToolbar
>[0]
type UseObjectsTopMenusArgs = Parameters<
	typeof import('../useObjectsTopMenus').useObjectsTopMenus
>[0]
type UseObjectsTopMenusResult = ReturnType<
	typeof import('../useObjectsTopMenus').useObjectsTopMenus
>
type UseObjectsToolbarPropsArgs = Parameters<
	typeof import('../useObjectsToolbarProps').useObjectsToolbarProps
>[0]
type UseObjectsToolbarPropsResult = ReturnType<
	typeof import('../useObjectsToolbarProps').useObjectsToolbarProps
>
type RefCell = {
	current: unknown | null
}

function readRef<T>(ref: RefCell): T {
	return ref.current as T
}

const {
	topMenusArgsRef,
	topMenusResultRef,
	toolbarPropsArgsRef,
	toolbarPropsResultRef,
} = vi.hoisted(
	(): Record<string, RefCell> => ({
		topMenusArgsRef: { current: null },
		topMenusResultRef: { current: null },
		toolbarPropsArgsRef: { current: null },
		toolbarPropsResultRef: { current: null },
	}),
)

vi.mock('../useObjectsTopMenus', () => ({
	useObjectsTopMenus: (args: UseObjectsTopMenusArgs) => {
		topMenusArgsRef.current = args
		return readRef<UseObjectsTopMenusResult>(topMenusResultRef)
	},
}))

vi.mock('../useObjectsToolbarProps', () => ({
	useObjectsToolbarProps: (args: UseObjectsToolbarPropsArgs) => {
		toolbarPropsArgsRef.current = args
		return readRef<UseObjectsToolbarPropsResult>(toolbarPropsResultRef)
	},
}))

function seedToolbarState(overrides?: { isDesktop?: boolean; screensSm?: boolean; screensMd?: boolean; screensXl?: boolean }) {
	const refresh = vi.fn().mockResolvedValue(undefined)
	const openUploadPicker = vi.fn()
	const openNewFolder = vi.fn()
	const openTransfers = vi.fn()
	const setTreeDrawerOpen = vi.fn()
	const setDetailsDrawerOpen = vi.fn()

	const props = {
		apiToken: 'token-a',
		profileId: 'profile-1',
	}
	const data = {
		isAdvanced: true,
			bucket: 'bucket-a',
			prefix: 'docs/',
			dockTree: true,
			currentPrefixActionMap: { mkdir: { key: 'mkdir' } },
			isDesktop: overrides?.isDesktop ?? true,
			screens: { sm: overrides?.screensSm ?? true, md: overrides?.screensMd ?? true, xl: overrides?.screensXl ?? true },
			isOffline: false,
			recentBuckets: ['bucket-a'],
			selectedCount: 2,
			bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
			bucketsQuery: {
				isFetching: true,
				isError: true,
				error: new Error('buckets failed'),
			},
			handleBucketDropdownVisibleChange: vi.fn(),
			canGoBack: true,
			canGoForward: false,
			canGoUp: true,
			goBack: vi.fn(),
			goForward: vi.fn(),
			onUp: vi.fn(),
			uploadSupported: false,
			uploadDisabledReason: 'Uploads disabled.',
			objectCrudSupported: true,
			profileCapabilities: { objectCrud: true },
			transfers: {
				activeTransferCount: 3,
				openTransfers,
			},
			dockDetails: false,
			setTreeDrawerOpen,
			setDetailsDrawerOpen,
			prefixByBucketRef: { current: { 'bucket-a': 'docs/' } },
			navigateToLocation: vi.fn(),
			tabs: [{ id: 'tab-1', bucket: 'bucket-a', prefix: 'docs/' }],
			activeTabId: 'tab-1',
			setActiveTabId: vi.fn(),
			addTab: vi.fn(),
		closeTab: vi.fn(),
	}
	const args = {
		props,
		locationVm: data,
		listVm: data,
		selectionVm: data,
		operationVm: data,
		paneVm: data,
		actions: {
			openUploadPicker,
			openNewFolder,
		} as unknown as UseObjectsScreenToolbarArgs['actions'],
		listState: {
			globalActionMap: { refresh: { key: 'refresh' } },
			currentPrefixActionMap: { mkdir: { key: 'mkdir' } },
			downloadSelectionAction: { key: 'download' },
			deleteSelectionAction: { key: 'delete' },
			listIsFetching: true,
		} as unknown as UseObjectsScreenToolbarArgs['listState'],
		refresh,
	} as unknown as UseObjectsScreenToolbarArgs

	topMenusResultRef.current = {
		topMoreMenu: { items: [{ key: 'refresh' }] },
	} as unknown as UseObjectsTopMenusResult
	toolbarPropsResultRef.current = {
		toolbarProps: { tag: 'toolbar-props' },
		canCreateFolder: true,
		createFolderTooltipText: 'Create folder',
	} as unknown as UseObjectsToolbarPropsResult

	return {
		args: args as UseObjectsScreenToolbarArgs,
		refs: { refresh, openUploadPicker, openNewFolder, openTransfers, setTreeDrawerOpen, setDetailsDrawerOpen },
	}
}

describe('useObjectsScreenToolbar', () => {
	beforeEach(() => {
		for (const ref of [
			topMenusArgsRef,
			topMenusResultRef,
			toolbarPropsArgsRef,
			toolbarPropsResultRef,
		]) {
			ref.current = null
		}
	})

	it('composes top menus and toolbar props into toolbar section state', () => {
		const { args, refs } = seedToolbarState()

		const { result } = renderHook(() => useObjectsScreenToolbar(args))

		expect(readRef<UseObjectsTopMenusArgs>(topMenusArgsRef)).toEqual({
			isAdvanced: true,
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			dockTree: true,
			globalActionMap: { refresh: { key: 'refresh' } },
			currentPrefixActionMap: { mkdir: { key: 'mkdir' } },
		})

		const toolbarArgs = readRef<UseObjectsToolbarPropsArgs>(toolbarPropsArgsRef)
		expect(toolbarArgs).toMatchObject({
			apiToken: 'token-a',
			isDesktop: true,
			showLabels: true,
			isAdvanced: true,
			isOffline: false,
			profileId: 'profile-1',
			bucket: 'bucket-a',
			recentBuckets: ['bucket-a'],
			selectedCount: 2,
			bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
			bucketsLoading: true,
			canGoBack: true,
			canGoForward: false,
			canGoUp: true,
			uploadEnabled: false,
			uploadDisabledReason: 'Uploads disabled.',
			onUpload: refs.openUploadPicker,
			objectCrudSupported: true,
			profileCapabilities: { objectCrud: true },
			topMoreMenu: { items: [{ key: 'refresh' }] },
			showPrimaryActions: false,
			primaryDownloadAction: { key: 'download' },
			primaryDeleteAction: { key: 'delete' },
			activeTransferCount: 3,
			dockTree: true,
			dockDetails: false,
			isRefreshing: true,
			prefixByBucketRef: { current: { 'bucket-a': 'docs/' } },
		})

		toolbarArgs.onOpenTransfers()
		toolbarArgs.onOpenTree()
		toolbarArgs.onOpenDetails()
		toolbarArgs.onNewFolder()
		toolbarArgs.onRefresh()

		expect(refs.openTransfers).toHaveBeenCalledTimes(1)
		expect(refs.setTreeDrawerOpen).toHaveBeenCalledWith(true)
		expect(refs.setDetailsDrawerOpen).toHaveBeenCalledWith(true)
		expect(refs.openNewFolder).toHaveBeenCalledTimes(1)
		expect(refs.refresh).toHaveBeenCalledTimes(1)

		expect(result.current).toEqual({
			canCreateFolder: true,
			createFolderTooltipText: 'Create folder',
			toolbarSectionProps: {
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucketsErrorMessage: 'buckets failed',
				isAdvanced: true,
				tabs: [{ id: 'tab-1', bucket: 'bucket-a', prefix: 'docs/' }],
				activeTabId: 'tab-1',
				onTabChange: args.locationVm.setActiveTabId,
				onTabAdd: args.locationVm.addTab,
				onTabClose: args.locationVm.closeTab,
				tabLabelMaxWidth: 320,
				toolbarProps: { tag: 'toolbar-props' },
			},
		})
	})

	it('uses the compact tab width when the medium breakpoint is absent', () => {
		const { args } = seedToolbarState({ screensMd: false })

		const { result } = renderHook(() => useObjectsScreenToolbar(args))

		expect(result.current.toolbarSectionProps.tabLabelMaxWidth).toBe(220)
	})

	it('hides toolbar labels on non-desktop layouts until the medium breakpoint is available', () => {
		const { args } = seedToolbarState({ isDesktop: false, screensSm: true, screensMd: false })

		renderHook(() => useObjectsScreenToolbar(args))

		expect(readRef<UseObjectsToolbarPropsArgs>(toolbarPropsArgsRef)).toMatchObject({
			isDesktop: false,
			showLabels: false,
		})
	})

	it('compacts desktop action labels until the extra-large breakpoint is available', () => {
		const { args } = seedToolbarState({ isDesktop: true, screensMd: true, screensXl: false })

		renderHook(() => useObjectsScreenToolbar(args))

		expect(readRef<UseObjectsToolbarPropsArgs>(toolbarPropsArgsRef)).toMatchObject({
			isDesktop: true,
			showLabels: false,
		})
	})
})
