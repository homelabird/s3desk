import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
	chooseProfileToLoadFoldersForWorkspaceHint,
	createFolderOrUploadFilesAtThisLevelHint,
	failedToLoadFoldersTitle,
	fetchingNestedPrefixesForThisLocationHint,
	loadingFoldersTitle,
	noFoldersHereYetTitle,
	pickBucketToBrowseFoldersAndNestedPrefixesHint,
	selectBucketFirstHint,
	selectProfileFirstHint,
} from '../../../lib/actionHints'
import { ObjectsTreeView } from '../ObjectsTreeView'

function buildProps(
	overrides: Partial<ComponentProps<typeof ObjectsTreeView>> = {},
): ComponentProps<typeof ObjectsTreeView> {
	return {
		hasProfile: true,
		hasBucket: true,
		treeData: [
			{
				key: '/',
				title: 'bucket-a',
				isLeaf: false,
				children: [],
			},
		],
		errorMessage: null,
		loadingKeys: [],
		expandedKeys: [],
		selectedKeys: ['/'],
		onExpandedKeysChange: vi.fn(),
		onSelectKey: vi.fn(),
		onLoadData: vi.fn(async () => {}),
		getDropTargetPrefix: vi.fn(() => '/'),
		canDragDrop: false,
		dndHoverPrefix: null,
		onDndTargetDragOver: vi.fn(),
		onDndTargetDragLeave: vi.fn(),
		onDndTargetDrop: vi.fn(),
		onPrefixContextMenu: vi.fn(),
		...overrides,
	}
}

describe('ObjectsTreeView', () => {
	it('shows a compact prerequisite status before a profile is selected', () => {
		render(<ObjectsTreeView {...buildProps({ hasProfile: false })} />)

		const status = screen.getByTestId('objects-tree-status')
		expect(status).toHaveAttribute('data-tree-status-kind', 'prereq')
		expect(status).toHaveTextContent(selectProfileFirstHint())
		expect(status).toHaveTextContent(chooseProfileToLoadFoldersForWorkspaceHint())
	})

	it('shows a compact prerequisite status before a bucket is selected', () => {
		render(<ObjectsTreeView {...buildProps({ hasBucket: false })} />)

		const status = screen.getByTestId('objects-tree-status')
		expect(status).toHaveAttribute('data-tree-status-kind', 'prereq')
		expect(status).toHaveTextContent(selectBucketFirstHint())
		expect(status).toHaveTextContent(pickBucketToBrowseFoldersAndNestedPrefixesHint())
	})

	it('shows a loading status while the root branch is fetching children', () => {
		render(<ObjectsTreeView {...buildProps({ expandedKeys: ['/'], loadingKeys: ['/'] })} />)

		const status = screen.getByTestId('objects-tree-status')
		expect(status).toHaveAttribute('data-tree-status-kind', 'loading')
		expect(status).toHaveTextContent(loadingFoldersTitle())
		expect(status).toHaveTextContent(fetchingNestedPrefixesForThisLocationHint())
	})

	it('shows an empty status when the selected root has no nested folders', () => {
		render(
			<ObjectsTreeView
				{...buildProps({
					expandedKeys: ['/'],
					treeData: [
						{
							key: '/',
							title: 'bucket-a',
							isLeaf: true,
						},
					],
				})}
			/>,
		)

		const status = screen.getByTestId('objects-tree-status')
		expect(status).toHaveAttribute('data-tree-status-kind', 'empty')
		expect(status).toHaveTextContent(noFoldersHereYetTitle())
		expect(status).toHaveTextContent(createFolderOrUploadFilesAtThisLevelHint())
	})

	it('shows an alert when folder loading fails', () => {
		render(<ObjectsTreeView {...buildProps({ errorMessage: 'prefix scan failed' })} />)

		const status = screen.getByTestId('objects-tree-status')
		expect(status).toHaveAttribute('data-tree-status-kind', 'error')
		expect(status).toHaveAttribute('role', 'alert')
		expect(status).toHaveTextContent(failedToLoadFoldersTitle())
		expect(status).toHaveTextContent('prefix scan failed')
	})
})
