import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
	deleteSelectedObjectsLabel,
	downloadToBrowserHint,
	newFolderShortcutHint,
	offlineNetworkConnectionHint,
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
	it('hides unavailable desktop actions until a bucket is selected', () => {
		const { rerender } = render(<ObjectsToolbar {...buildProps({ hasProfile: false, bucket: '' })} />)

		expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'New folder' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Object tools' })).not.toBeInTheDocument()

		rerender(<ObjectsToolbar {...buildProps({ bucket: '' })} />)
		expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument()

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

	it('keeps mobile folders in more actions while exposing contextual details', () => {
		render(
			<ObjectsToolbar
				{...buildProps({
					isDesktop: false,
					showLabels: true,
					selectedCount: 1,
					dockTree: false,
					treeDrawerOpen: true,
					dockDetails: false,
					detailsDrawerOpen: false,
				})}
			/>,
		)

		expect(screen.queryByRole('button', { name: 'Folders' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'New folder' })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()

		const detailsButton = screen.getByRole('button', { name: 'Details' })
		expect(detailsButton).toHaveAttribute('aria-haspopup', 'dialog')
		expect(detailsButton).toHaveAttribute('aria-expanded', 'false')
		expect(detailsButton).toHaveAttribute('aria-controls', 'objects-details-drawer')
	})

	it('keeps primary mobile actions visible while hiding unavailable contextual actions', () => {
		render(<ObjectsToolbar {...buildProps({ isDesktop: false, showLabels: false })} />)

		expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Go forward' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Go up' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Folders' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'New folder' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Upload' })).toHaveTextContent('Upload')
		expect(screen.getByRole('button', { name: 'More actions' })).toHaveTextContent('More')
	})

	it('shows mobile details when objects are selected', () => {
		render(
			<ObjectsToolbar
				{...buildProps({
					isDesktop: false,
					showLabels: true,
					selectedCount: 1,
					dockDetails: false,
				})}
			/>,
		)

		expect(screen.getByRole('button', { name: 'Details' })).toBeEnabled()
	})

	it('shows mobile history actions when they can be used', () => {
		render(
			<ObjectsToolbar
				{...buildProps({
					isDesktop: false,
					showLabels: true,
					canGoBack: true,
					canGoForward: true,
					canGoUp: true,
				})}
			/>,
		)

		expect(screen.getByRole('button', { name: 'Go back' })).toBeEnabled()
		expect(screen.getByRole('button', { name: 'Go forward' })).toBeEnabled()
		expect(screen.getByRole('button', { name: 'Go up' })).toBeEnabled()
	})
})
