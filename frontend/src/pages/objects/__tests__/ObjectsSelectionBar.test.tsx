import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ObjectsSelectionBar } from '../ObjectsSelectionBar'
import type { UIAction } from '../objectsActions'

function buildAction(overrides: Partial<UIAction> = {}): UIAction {
	return {
		id: 'action',
		label: 'Action',
		enabled: true,
		run: vi.fn(),
		...overrides,
	}
}

describe('ObjectsSelectionBar', () => {
	it('renders the shared selection shell with compact actions', () => {
		render(
			<ObjectsSelectionBar
				selectedCount={2}
				singleSelectedKey="docs/report.txt"
				singleSelectedSize={128}
				isAdvanced
				clearAction={buildAction({ id: 'clear_selection', label: 'Clear selection (Esc)', shortLabel: 'Clear' })}
				deleteAction={buildAction({ id: 'delete_selected', label: 'Delete selection', shortLabel: 'Delete', danger: true })}
				downloadAction={buildAction({ id: 'download_selected', label: 'Download selection', shortLabel: 'Download' })}
				moveAction={buildAction({ id: 'move_selected_to', label: 'Move selection to…', shortLabel: 'Move to…' })}
				selectionMenuActions={[buildAction({ id: 'copy_selected_keys', label: 'Copy selected keys', shortLabel: 'Copy' })]}
				getObjectActions={() => [buildAction({ id: 'copy_selected_keys', label: 'Copy selected keys', shortLabel: 'Copy' })]}
				isDownloadLoading={false}
				isDeleteLoading={false}
			/>,
		)

		expect(screen.getByTestId('objects-selection-bar')).toBeInTheDocument()
		expect(screen.getByRole('status', { name: '2 selected' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Clear' })).toBeVisible()
		expect(screen.getByRole('button', { name: 'Download' })).toBeVisible()
		expect(screen.getByRole('button', { name: 'Move to…' })).toBeVisible()
		const moreButton = screen.getByRole('button', { name: 'More selection actions' })
		expect(moreButton).toBeVisible()
		expect(moreButton).toHaveAttribute('aria-haspopup', 'menu')
		expect(moreButton).toHaveAttribute('aria-expanded', 'false')
		expect(screen.getByRole('button', { name: 'Delete' })).toBeVisible()
	})

	it('does not render when no objects are selected', () => {
		const { container } = render(
			<ObjectsSelectionBar
				selectedCount={0}
				singleSelectedKey={null}
				isAdvanced
				selectionMenuActions={[]}
				getObjectActions={() => []}
				isDownloadLoading={false}
				isDeleteLoading={false}
			/>,
		)

		expect(container).toBeEmptyDOMElement()
	})
})
