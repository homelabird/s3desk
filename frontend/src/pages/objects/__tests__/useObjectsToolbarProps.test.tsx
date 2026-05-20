import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
	createNewFolderMarkerObjectHint,
	offlineNetworkConnectionHint,
	selectBucketFirstHint,
	selectProfileFirstHint,
} from '../../../lib/actionHints'
import { useObjectsToolbarProps } from '../useObjectsToolbarProps'

function buildArgs(overrides: Partial<Parameters<typeof useObjectsToolbarProps>[0]> = {}): Parameters<typeof useObjectsToolbarProps>[0] {
	return {
		apiToken: 'token-a',
		isDesktop: true,
		showLabels: true,
		isAdvanced: true,
		isOffline: false,
		profileId: 'profile-1',
		bucket: 'bucket-a',
		recentBuckets: ['bucket-a'],
		selectedCount: 0,
		bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
		bucketsLoading: false,
		canGoBack: false,
		canGoForward: false,
		canGoUp: false,
		onGoBack: vi.fn(),
		onGoForward: vi.fn(),
		onGoUp: vi.fn(),
		uploadEnabled: true,
		uploadDisabledReason: null,
		onUpload: vi.fn(),
		objectCrudSupported: true,
		profileCapabilities: null,
		topMoreMenu: { items: [] },
		showPrimaryActions: false,
		activeTransferCount: 0,
		onOpenTransfers: vi.fn(),
		dockTree: true,
		treeDrawerOpen: false,
		dockDetails: true,
		detailsDrawerOpen: false,
		onOpenTree: vi.fn(),
		onOpenDetails: vi.fn(),
		onNewFolder: vi.fn(),
		onRefresh: vi.fn(),
		isRefreshing: false,
		prefixByBucketRef: { current: {} },
		navigateToLocation: vi.fn(),
		...overrides,
	}
}

describe('useObjectsToolbarProps', () => {
	it('uses shared helper copy for create-folder tooltip states', () => {
		const { result, rerender } = renderHook((args: Parameters<typeof useObjectsToolbarProps>[0]) => useObjectsToolbarProps(args), {
			initialProps: buildArgs({ profileId: null, bucket: '' }),
		})

		expect(result.current.createFolderTooltipText).toBe(selectProfileFirstHint())

		rerender(buildArgs({ bucket: '' }))
		expect(result.current.createFolderTooltipText).toBe(selectBucketFirstHint())

		rerender(buildArgs({ isOffline: true }))
		expect(result.current.createFolderTooltipText).toBe(offlineNetworkConnectionHint())

		rerender(buildArgs())
		expect(result.current.createFolderTooltipText).toBe(createNewFolderMarkerObjectHint())
	})
})
