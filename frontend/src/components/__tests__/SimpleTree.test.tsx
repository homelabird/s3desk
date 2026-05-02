import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
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
		expect(screen.queryByRole('tree')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Collapse root' })).toHaveAttribute('aria-expanded', 'true')
		expect(screen.getByRole('button', { name: 'reports' })).toHaveAttribute('aria-current', 'true')
	})
})
