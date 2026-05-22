import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
	deleteSelectedObjectsLabel,
	downloadToBrowserHint,
	newFolderShortcutHint,
	offlineNetworkConnectionHint,
	selectBucketFirstHint,
	selectProfileFirstHint,
	uploadFilesOrFoldersHint,
	uploadsUnsupportedHint,
} from '../../../lib/actionHints'
import { ObjectsToolbar } from '../ObjectsToolbar'

vi.mock('../ObjectsBucketPicker', () => ({
	ObjectsBucketPicker: () => <div data-testid="objects-bucket-picker" />,
}))

vi.mock('../ObjectsMenuPopover', () => ({
	ObjectsMenuPopover: ({
		children,
	}: {
		children: (args: { toggle: () => void; open: boolean }) => ReactNode
	}) => <div>{children({ toggle: vi.fn(), open: false })}</div>,
}))

function buildProps(overrides: Partial<Parameters<typeof ObjectsToolbar>[0]> = {}): Parameters<typeof ObjectsToolbar>[0] {
	return {
		isDesktop: true,
		showLabels: true,
		isAdvanced: true,
		isOffline: false,
		hasProfile: true,
		bucketPickerScopeKey: 'token-a:profile-1',
		bucket: 'bucket-a',
		recentBuckets: ['bucket-a'],
		selectedCount: 0,
		bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
		bucketsLoading: false,
		onBucketChange: vi.fn(),
		canGoBack: false,
		canGoForward: false,
		canGoUp: false,
		onGoBack: vi.fn(),
		onGoForward: vi.fn(),
		onGoUp: vi.fn(),
		uploadEnabled: true,
		uploadDisabledReason: null,
		onUpload: vi.fn(),
		canCreateFolder: false,
		createFolderTooltipText: 'Create folder',
		onNewFolder: vi.fn(),
		onRefresh: vi.fn(),
		isRefreshing: false,
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
		...overrides,
	}
}

describe('ObjectsToolbar', () => {
	it('uses shared prerequisite and unsupported hints for upload tooltip copy', () => {
		const { rerender } = render(<ObjectsToolbar {...buildProps({ hasProfile: false, bucket: '' })} />)

		expect(screen.getByTitle(selectProfileFirstHint())).toBeInTheDocument()

		rerender(<ObjectsToolbar {...buildProps({ bucket: '' })} />)
		expect(screen.getByTitle(selectBucketFirstHint())).toBeInTheDocument()

		rerender(<ObjectsToolbar {...buildProps({ isOffline: true })} />)
		expect(screen.getByTitle(offlineNetworkConnectionHint())).toBeInTheDocument()

		rerender(<ObjectsToolbar {...buildProps({ uploadEnabled: false })} />)
		expect(screen.getByTitle(uploadsUnsupportedHint())).toBeInTheDocument()

		rerender(<ObjectsToolbar {...buildProps()} />)
		expect(screen.getByTitle(uploadFilesOrFoldersHint())).toBeInTheDocument()
	})

	it('uses shared selection-action tooltip copy for disabled primary actions', () => {
		render(
			<ObjectsToolbar
				{...buildProps({
					selectedCount: 2,
					showPrimaryActions: true,
					primaryDownloadAction: {
						id: 'download',
						label: 'Download',
						enabled: false,
						run: vi.fn(),
					},
					primaryDeleteAction: {
						id: 'delete',
						label: 'Delete',
						enabled: false,
						danger: true,
						run: vi.fn(),
					},
				})}
			/>,
		)

		expect(screen.getByTitle(downloadToBrowserHint())).toBeInTheDocument()
		expect(screen.getByTitle(deleteSelectedObjectsLabel())).toBeInTheDocument()
	})

	it('uses shared new-folder shortcut copy when folder creation is enabled', () => {
		render(<ObjectsToolbar {...buildProps({ canCreateFolder: true })} />)

		expect(screen.getByTitle(newFolderShortcutHint())).toBeInTheDocument()
	})

	it('exposes the toolbar more menu disclosure state', () => {
		render(<ObjectsToolbar {...buildProps()} />)

		const moreButton = screen.getByRole('button', { name: 'Object tools' })
		expect(moreButton).toHaveAttribute('aria-haspopup', 'menu')
		expect(moreButton).toHaveAttribute('aria-expanded', 'false')
	})

	it('exposes mobile drawer disclosure state for folders and details', () => {
		render(
			<ObjectsToolbar
				{...buildProps({
					isDesktop: false,
					showLabels: true,
					dockTree: false,
					treeDrawerOpen: true,
					dockDetails: false,
					detailsDrawerOpen: false,
				})}
			/>,
		)

		const foldersButton = screen.getByRole('button', { name: 'Folders' })
		expect(foldersButton).toHaveAttribute('aria-haspopup', 'dialog')
		expect(foldersButton).toHaveAttribute('aria-expanded', 'true')
		expect(foldersButton).toHaveAttribute('aria-controls', 'objects-tree-drawer')

		const detailsButton = screen.getByRole('button', { name: 'Details' })
		expect(detailsButton).toHaveAttribute('aria-haspopup', 'dialog')
		expect(detailsButton).toHaveAttribute('aria-expanded', 'false')
		expect(detailsButton).toHaveAttribute('aria-controls', 'objects-details-drawer')
	})
})
