import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppTabs } from '../AppTabs'

describe('AppTabs', () => {
	it('keeps the controlled active tab in view', async () => {
		const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
		const scrollIntoView = vi.fn()
		Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })

		try {
			const { rerender } = render(
				<AppTabs
					activeKey="tab-a"
					items={[
						{ key: 'tab-a', label: 'First tab', children: <div>First panel</div> },
						{ key: 'tab-b', label: 'Second tab', children: <div>Second panel</div> },
					]}
				/>,
			)

			await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
			rerender(
				<AppTabs
					activeKey="tab-b"
					items={[
						{ key: 'tab-a', label: 'First tab', children: <div>First panel</div> },
						{ key: 'tab-b', label: 'Second tab', children: <div>Second panel</div> },
					]}
				/>,
			)

			await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2))
			expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' })
		} finally {
			if (originalScrollIntoView) {
				Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: originalScrollIntoView })
			} else {
				Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
			}
		}
	})

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

		const toolbar = screen.getByRole('toolbar', { name: 'View controls' })
		const root = toolbar.parentElement
		if (!(root instanceof HTMLElement)) {
			throw new Error('Missing AppTabs root')
		}

		let scrollLeft = 0
		Object.defineProperty(toolbar, 'clientWidth', { configurable: true, get: () => 180 })
		Object.defineProperty(toolbar, 'scrollWidth', { configurable: true, get: () => 320 })
		Object.defineProperty(toolbar, 'scrollLeft', { configurable: true, get: () => scrollLeft })

		window.dispatchEvent(new Event('resize'))

		await waitFor(() => expect(root).toHaveAttribute('data-scrollable', 'true'))
		expect(root).toHaveAttribute('data-at-start', 'true')
		expect(root).toHaveAttribute('data-at-end', 'false')

		scrollLeft = 140
		fireEvent.scroll(toolbar)

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

	it('can expose panel-backed tabs with tab semantics', () => {
		render(
			<AppTabs
				type="card"
				semanticRole="tabs"
				ariaLabel="Object workspaces"
				activeKey="tab-a"
				items={[
					{ key: 'tab-a', label: 'bucket-a', children: <div>bucket-a panel</div> },
					{ key: 'tab-b', label: 'bucket-b', children: <div>bucket-b panel</div> },
				]}
			/>,
		)

		expect(screen.getByRole('tablist', { name: 'Object workspaces' })).toBeInTheDocument()
		expect(screen.getByRole('tab', { name: 'bucket-a' })).toHaveAttribute('aria-selected', 'true')
		expect(screen.getByRole('tab', { name: 'bucket-b' })).toHaveAttribute('aria-selected', 'false')
		expect(screen.getByRole('tabpanel')).toHaveTextContent('bucket-a panel')
	})

	it('can wire tab semantics to externally controlled panels', () => {
		render(
			<AppTabs
				type="editable-card"
				semanticRole="tabs"
				ariaLabel="Object workspaces"
				activeKey="tab-a"
				items={[
					{ key: 'tab-a', label: 'bucket-a', panelId: 'workspace-panel-a' },
					{ key: 'tab-b', label: 'bucket-b', panelId: 'workspace-panel-b' },
				]}
			/>,
		)

		expect(screen.getByRole('tablist', { name: 'Object workspaces' })).toBeInTheDocument()
		expect(screen.getByRole('tab', { name: 'bucket-a' })).toHaveAttribute('aria-controls', 'workspace-panel-a')
		expect(screen.getByRole('tab', { name: 'bucket-b' })).toHaveAttribute('aria-controls', 'workspace-panel-b')
		expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
	})
})
