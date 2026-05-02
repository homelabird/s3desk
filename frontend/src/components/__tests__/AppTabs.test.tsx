import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppTabs } from '../AppTabs'

describe('AppTabs', () => {
	it('tracks horizontal overflow state for small editable tabs', async () => {
		render(
			<AppTabs
				type="editable-card"
				size="small"
				items={[
					{ key: 'tab-a', label: 'First tab', closable: true, ariaLabel: 'First tab' },
					{ key: 'tab-b', label: 'Second tab', closable: true, ariaLabel: 'Second tab' },
					{ key: 'tab-c', label: 'Third tab', closable: true, ariaLabel: 'Third tab' },
				]}
				onEdit={vi.fn()}
			/>,
		)

		const tabList = screen.getByRole('tablist')
		const root = tabList.parentElement
		if (!(root instanceof HTMLElement)) {
			throw new Error('Missing AppTabs root')
		}

		let scrollLeft = 0
		Object.defineProperty(tabList, 'clientWidth', { configurable: true, get: () => 180 })
		Object.defineProperty(tabList, 'scrollWidth', { configurable: true, get: () => 320 })
		Object.defineProperty(tabList, 'scrollLeft', { configurable: true, get: () => scrollLeft })

		window.dispatchEvent(new Event('resize'))

		await waitFor(() => expect(root).toHaveAttribute('data-scrollable', 'true'))
		expect(root).toHaveAttribute('data-at-start', 'true')
		expect(root).toHaveAttribute('data-at-end', 'false')

		scrollLeft = 140
		fireEvent.scroll(tabList)

		await waitFor(() => expect(root).toHaveAttribute('data-at-start', 'false'))
		expect(root).toHaveAttribute('data-at-end', 'true')
	})

	it('emits add and close actions for editable tabs', () => {
		const onEdit = vi.fn()

		render(
			<AppTabs
				type="editable-card"
				size="small"
				items={[
					{ key: 'tab-a', label: 'First tab', closable: true, ariaLabel: 'First tab' },
					{ key: 'tab-b', label: 'Second tab', closable: true, ariaLabel: 'Second tab' },
				]}
				onEdit={onEdit}
			/>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Add tab' }))
		fireEvent.click(screen.getByRole('button', { name: 'Close tab: First tab' }))

		expect(onEdit).toHaveBeenNthCalledWith(1, null, 'add')
		expect(onEdit).toHaveBeenNthCalledWith(2, 'tab-a', 'remove')
	})
})
