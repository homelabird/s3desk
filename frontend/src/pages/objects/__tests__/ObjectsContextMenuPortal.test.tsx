import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { ObjectsContextMenuPortal } from '../ObjectsContextMenuPortal'

describe('ObjectsContextMenuPortal', () => {
	it('focuses the first enabled menu item when mounted', async () => {
		const contextMenuRef = createRef<HTMLDivElement>()

		render(
			<ObjectsContextMenuPortal
				contextMenuClassName="objects-context-menu"
				contextMenuRef={contextMenuRef}
				contextMenuProps={{
					items: [
						{ key: 'disabled', label: 'Disabled action', disabled: true },
						{ key: 'download', label: 'Download (client)' },
						{ key: 'rename', label: 'Rename (F2)…' },
					],
				}}
				contextMenuStyle={{ position: 'fixed', top: 10, left: 20 }}
			/>,
		)

		expect(contextMenuRef.current).toBe(screen.getByTestId('objects-context-menu'))
		await waitFor(() => {
			expect(screen.getByRole('menuitem', { name: 'Download (client)' })).toHaveFocus()
		})
	})
})
