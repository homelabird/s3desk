import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SimpleTree } from '../SimpleTree'

describe('SimpleTree', () => {
	it('exposes stable row hooks and indent styles for nested rows', () => {
		render(
			<SimpleTree
				nodes={[
					{
						key: '/',
						title: 'root',
						children: [
							{
								key: 'reports/',
								title: 'reports',
							},
						],
					},
				]}
				expandedKeys={['/']}
				selectedKeys={['reports/']}
				onExpandedKeysChange={vi.fn()}
				onSelectKey={vi.fn()}
				rowTestId="tree-row"
				indentPx={12}
			/>,
		)

		const rows = screen.getAllByTestId('tree-row')
		expect(rows).toHaveLength(2)
		expect(rows[0]).toHaveAttribute('data-tree-depth', '0')
		expect(rows[0]).toHaveAttribute('data-tree-key', '/')
		expect(rows[0]).toHaveStyle({ paddingLeft: '0px' })
		expect(rows[1]).toHaveAttribute('data-tree-depth', '1')
		expect(rows[1]).toHaveAttribute('data-tree-key', 'reports/')
		expect(rows[1]).toHaveStyle({ paddingLeft: '12px' })
		expect(screen.getByRole('tree', { name: 'Tree' })).toBeInTheDocument()

		const root = screen.getByRole('treeitem', { name: 'root' })
		const reports = screen.getByRole('treeitem', { name: 'reports' })
		expect(root).toHaveAttribute('aria-expanded', 'true')
		expect(root).toHaveAttribute('aria-level', '1')
		expect(root).toHaveAttribute('aria-posinset', '1')
		expect(root).toHaveAttribute('aria-setsize', '1')
		expect(root).toHaveAttribute('aria-selected', 'false')
		expect(reports).toHaveAttribute('aria-level', '2')
		expect(reports).toHaveAttribute('aria-selected', 'true')
		expect(reports).toHaveAttribute('tabindex', '0')
	})

	it('supports tree keyboard navigation and selection', () => {
		const onExpandedKeysChange = vi.fn()
		const onSelectKey = vi.fn()
		render(
			<SimpleTree
				ariaLabel="Folders"
				nodes={[
					{
						key: '/',
						title: 'root',
						children: [
							{
								key: 'reports/',
								title: 'reports',
								isLeaf: true,
							},
						],
					},
				]}
				expandedKeys={['/']}
				selectedKeys={['/']}
				onExpandedKeysChange={onExpandedKeysChange}
				onSelectKey={onSelectKey}
			/>,
		)

		const root = screen.getByRole('treeitem', { name: 'root' })
		const reports = screen.getByRole('treeitem', { name: 'reports' })

		root.focus()
		fireEvent.keyDown(root, { key: 'ArrowDown' })
		expect(reports).toHaveFocus()

		fireEvent.keyDown(reports, { key: 'Enter' })
		expect(onSelectKey).toHaveBeenCalledWith('reports/')

		fireEvent.keyDown(reports, { key: 'ArrowLeft' })
		expect(root).toHaveFocus()

		fireEvent.keyDown(root, { key: 'ArrowLeft' })
		expect(onExpandedKeysChange).toHaveBeenCalledWith([])
	})

	it('announces loading tree items', () => {
		render(
			<SimpleTree
				nodes={[
					{
						key: '/',
						title: 'root',
					},
				]}
				expandedKeys={['/']}
				selectedKeys={['/']}
				loadingKeys={['/']}
				onExpandedKeysChange={vi.fn()}
				onSelectKey={vi.fn()}
			/>,
		)

		expect(screen.getByRole('treeitem', { name: 'root' })).toHaveAttribute('aria-busy', 'true')
		expect(screen.getByRole('status')).toHaveTextContent('Loading root')
	})

	it('windows large trees', () => {
		render(
			<SimpleTree
				nodes={Array.from({ length: 1_000 }, (_, index) => ({
					key: `folder-${index}`,
					title: `folder-${index}`,
					isLeaf: true,
				}))}
				expandedKeys={[]}
				selectedKeys={[]}
				onExpandedKeysChange={vi.fn()}
				onSelectKey={vi.fn()}
				rowTestId="tree-row"
			/>,
		)

		expect(screen.getAllByTestId('tree-row')).toHaveLength(30)
		expect(screen.getByRole('treeitem', { name: 'folder-0' })).toBeInTheDocument()
		expect(screen.queryByRole('treeitem', { name: 'folder-999' })).not.toBeInTheDocument()
	})
})
