import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectsPageActions } from '../useObjectsPageActions'

type UseObjectsPageActionsArgs = Parameters<
	typeof import('../useObjectsPageActions').useObjectsPageActions
>[0]
type UseObjectsSelectionEffectsArgs = Parameters<
	typeof import('../useObjectsSelectionEffects').useObjectsSelectionEffects
>[0]
type UseObjectsSelectionEffectsResult = ReturnType<
	typeof import('../useObjectsSelectionEffects').useObjectsSelectionEffects
>
type UseObjectsDetailsActionsArgs = Parameters<
	typeof import('../useObjectsDetailsActions').useObjectsDetailsActions
>[0]
type UseObjectsDetailsActionsResult = ReturnType<
	typeof import('../useObjectsDetailsActions').useObjectsDetailsActions
>
type UseObjectsPageDialogActionsArgs = Parameters<
	typeof import('../useObjectsPageDialogActions').useObjectsPageDialogActions
>[0]
type UseObjectsPageDialogActionsResult = ReturnType<
	typeof import('../useObjectsPageDialogActions').useObjectsPageDialogActions
>
type UseObjectsPageUploadActionsArgs = Parameters<
	typeof import('../useObjectsPageUploadActions').useObjectsPageUploadActions
>[0]
type UseObjectsPageUploadActionsResult = ReturnType<
	typeof import('../useObjectsPageUploadActions').useObjectsPageUploadActions
>
type RefCell = {
	current: unknown | null
}

function readRef<T>(ref: RefCell): T {
	return ref.current as T
}

const {
	selectionEffectsArgsRef,
	selectionEffectsResultRef,
	detailsActionsArgsRef,
	detailsActionsResultRef,
	dialogActionsArgsRef,
	dialogActionsResultRef,
	uploadActionsArgsRef,
	uploadActionsResultRef,
} = vi.hoisted(
	(): Record<string, RefCell> => ({
		selectionEffectsArgsRef: { current: null },
		selectionEffectsResultRef: { current: null },
		detailsActionsArgsRef: { current: null },
		detailsActionsResultRef: { current: null },
		dialogActionsArgsRef: { current: null },
		dialogActionsResultRef: { current: null },
		uploadActionsArgsRef: { current: null },
		uploadActionsResultRef: { current: null },
	}),
)

vi.mock('../useObjectsSelectionEffects', () => ({
	useObjectsSelectionEffects: (args: UseObjectsSelectionEffectsArgs) => {
		selectionEffectsArgsRef.current = args
		return readRef<UseObjectsSelectionEffectsResult>(selectionEffectsResultRef)
	},
}))

vi.mock('../useObjectsDetailsActions', () => ({
	useObjectsDetailsActions: (args: UseObjectsDetailsActionsArgs) => {
		detailsActionsArgsRef.current = args
		return readRef<UseObjectsDetailsActionsResult>(detailsActionsResultRef)
	},
}))

vi.mock('../useObjectsPageDialogActions', () => ({
	useObjectsPageDialogActions: (args: UseObjectsPageDialogActionsArgs) => {
		dialogActionsArgsRef.current = args
		return readRef<UseObjectsPageDialogActionsResult>(dialogActionsResultRef)
	},
}))

vi.mock('../useObjectsPageUploadActions', () => ({
	useObjectsPageUploadActions: (args: UseObjectsPageUploadActionsArgs) => {
		uploadActionsArgsRef.current = args
		return readRef<UseObjectsPageUploadActionsResult>(uploadActionsResultRef)
	},
}))

function seedPageActionsState() {
	const createJobWithRetry = vi.fn()
	const clearSearch = vi.fn()
	const setFavoritesOnly = vi.fn()
	const setTypeFilter = vi.fn()
	const refreshTreeNode = vi.fn()
	const onOpenPrefix = vi.fn()
	const setSelectedKeys = vi.fn()
	const setLastSelectedObjectKey = vi.fn()
	const navigateToLocation = vi.fn()
	const setDetailsOpen = vi.fn()
	const setDetailsDrawerOpen = vi.fn()
	const setTreeDrawerOpen = vi.fn()

	const handleFavoriteSelect = vi.fn()
	const openDetails = vi.fn()
	const openDetailsForKey = vi.fn()
	const toggleDetails = vi.fn()
	const openRenameObject = vi.fn()
	const openUploadPicker = vi.fn()

	selectionEffectsResultRef.current = {
		handleFavoriteSelect,
	} as unknown as UseObjectsSelectionEffectsResult
	detailsActionsResultRef.current = {
		openDetails,
		openDetailsForKey,
		toggleDetails,
	} as unknown as UseObjectsDetailsActionsResult
	dialogActionsResultRef.current = {
		openRenameObject,
		deleteMutation: { isPending: false },
		deletingKey: null,
		presignMutation: { isPending: true },
		presignKey: 'docs/report.pdf',
	} as unknown as UseObjectsPageDialogActionsResult
	uploadActionsResultRef.current = {
		openUploadPicker,
		uploadSourceOpen: true,
	} as unknown as UseObjectsPageUploadActionsResult

	return {
		args: {
			api: { tag: 'api' },
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			dockDetails: true,
			downloadLinkProxyEnabled: true,
			presignedDownloadSupported: true,
			createJobWithRetry,
			typeFilter: 'all',
			favoritesOnly: false,
			deferredSearch: 'annual',
			clearSearch,
			setFavoritesOnly,
			setTypeFilter,
			refreshTreeNode,
			onOpenPrefix,
			transfers: { tag: 'transfers' },
			isOffline: false,
			uploadSupported: false,
			uploadDisabledReason: 'provider-disabled',
			selectedKeys: new Set(['docs/report.pdf']),
			setSelectedKeys,
			setLastSelectedObjectKey,
			favoritesOpenDetails: true,
			navigateToLocation,
			setDetailsOpen,
			setDetailsDrawerOpen,
			setTreeDrawerOpen,
		} as unknown as UseObjectsPageActionsArgs,
		refs: {
			handleFavoriteSelect,
			openDetails,
			openDetailsForKey,
			toggleDetails,
			openRenameObject,
			openUploadPicker,
			createJobWithRetry,
			clearSearch,
			setFavoritesOnly,
			setTypeFilter,
			refreshTreeNode,
			onOpenPrefix,
			setSelectedKeys,
			setLastSelectedObjectKey,
			navigateToLocation,
			setDetailsOpen,
			setDetailsDrawerOpen,
			setTreeDrawerOpen,
		},
	}
}

describe('useObjectsPageActions', () => {
	beforeEach(() => {
		for (const ref of [
			selectionEffectsArgsRef,
			selectionEffectsResultRef,
			detailsActionsArgsRef,
			detailsActionsResultRef,
			dialogActionsArgsRef,
			dialogActionsResultRef,
			uploadActionsArgsRef,
			uploadActionsResultRef,
		]) {
			ref.current = null
		}
	})

	it('wires selection, details, dialog, and upload action hooks into one state object', () => {
		const { args, refs } = seedPageActionsState()

		const { result } = renderHook(() => useObjectsPageActions(args))

		expect(readRef<UseObjectsSelectionEffectsArgs>(selectionEffectsArgsRef)).toEqual({
			apiToken: 'token-a',
			bucket: 'bucket-a',
			prefix: 'docs/',
			profileId: 'profile-1',
			favoritesOpenDetails: true,
			navigateToLocation: refs.navigateToLocation,
			setDetailsOpen: refs.setDetailsOpen,
			setDetailsDrawerOpen: refs.setDetailsDrawerOpen,
			setTreeDrawerOpen: refs.setTreeDrawerOpen,
			setSelectedKeys: refs.setSelectedKeys,
			setLastSelectedObjectKey: refs.setLastSelectedObjectKey,
		})
		expect(readRef<UseObjectsDetailsActionsArgs>(detailsActionsArgsRef)).toEqual({
			dockDetails: true,
			setDetailsOpen: refs.setDetailsOpen,
			setDetailsDrawerOpen: refs.setDetailsDrawerOpen,
			setSelectedKeys: refs.setSelectedKeys,
			setLastSelectedObjectKey: refs.setLastSelectedObjectKey,
		})
		expect(readRef<UseObjectsPageDialogActionsArgs>(dialogActionsArgsRef)).toMatchObject({
			api: { tag: 'api' },
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			downloadLinkProxyEnabled: true,
			presignedDownloadSupported: true,
			createJobWithRetry: refs.createJobWithRetry,
			typeFilter: 'all',
			favoritesOnly: false,
			deferredSearch: 'annual',
			clearSearch: refs.clearSearch,
			setFavoritesOnly: refs.setFavoritesOnly,
			setTypeFilter: refs.setTypeFilter,
			refreshTreeNode: refs.refreshTreeNode,
			onOpenPrefix: refs.onOpenPrefix,
			transfers: { tag: 'transfers' },
			selectedKeys: new Set(['docs/report.pdf']),
			setSelectedKeys: refs.setSelectedKeys,
		})
		expect(readRef<UseObjectsPageUploadActionsArgs>(uploadActionsArgsRef)).toEqual({
			apiToken: 'token-a',
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			isOffline: false,
			uploadSupported: false,
			uploadDisabledReason: 'provider-disabled',
			transfers: { tag: 'transfers' },
		})

		expect(result.current).toMatchObject({
			handleFavoriteSelect: refs.handleFavoriteSelect,
			openDetails: refs.openDetails,
			openDetailsForKey: refs.openDetailsForKey,
			toggleDetails: refs.toggleDetails,
			openRenameObject: refs.openRenameObject,
			openUploadPicker: refs.openUploadPicker,
			uploadSourceOpen: true,
			deleteMutation: { isPending: false },
			deletingKey: null,
			presignMutation: { isPending: true },
			presignKey: 'docs/report.pdf',
		})
	})
})
