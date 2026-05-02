import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PopoverSurface } from '../PopoverSurface'

const VIEWPORT_PADDING = 16

function createRect({ top, left, width, height }: { top: number; left: number; width: number; height: number }): DOMRect {
	return {
		x: left,
		y: top,
		top,
		left,
		width,
		height,
		right: left + width,
		bottom: top + height,
		toJSON: () => ({}),
	} as DOMRect
}

function mockSafeAreaInsets({ top = 0, right = 0, bottom = 0, left = 0 }: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>) {
	const realGetComputedStyle = window.getComputedStyle.bind(window)
	vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
		if (element instanceof HTMLElement && element.dataset.popoverSafeAreaProbe === 'true') {
			const style = realGetComputedStyle(element, pseudoElement)
			return Object.assign(Object.create(style), {
				paddingTop: `${top}px`,
				paddingRight: `${right}px`,
				paddingBottom: `${bottom}px`,
				paddingLeft: `${left}px`,
			}) as CSSStyleDeclaration
		}
		return realGetComputedStyle(element, pseudoElement)
	})
}

function parsePx(value: string) {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}

function readPanelPlacement(panel: HTMLElement) {
	return {
		top: parsePx(panel.style.top),
		left: parsePx(panel.style.left),
		availableHeight: parsePx(panel.style.getPropertyValue('--popover-available-height')),
		availableWidth: parsePx(panel.style.getPropertyValue('--popover-available-width')),
	}
}

afterEach(() => {
	vi.restoreAllMocks()
	document.querySelector('[data-popover-safe-area-probe="true"]')?.remove()
})

describe('PopoverSurface', () => {
	it('clamps the panel within a custom viewport rect and publishes panel size budget variables', async () => {
		const viewportRect = createRect({ top: 100, left: 20, width: 740, height: 240 })
		const anchorRect = createRect({ top: 0, left: 25, width: 32, height: 25 })
		const panelRect = createRect({ top: 0, left: 0, width: 202, height: 344 })
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
			switch (this.getAttribute('data-testid')) {
				case 'viewport':
					return viewportRect
				case 'anchor':
					return anchorRect
				case 'panel':
					return panelRect
				default:
					return createRect({ top: 0, left: 0, width: 0, height: 0 })
			}
		})

		render(
			<div data-testid="viewport">
				<PopoverSurface
					open
					rootProps={{ 'data-testid': 'anchor' }}
					contentProps={{ 'data-testid': 'panel' }}
					getViewportRect={(anchorElement) => {
						const viewportElement = anchorElement.closest('[data-testid="viewport"]')
						return viewportElement instanceof HTMLElement ? viewportElement.getBoundingClientRect() : null
					}}
					content={() => <div>Menu</div>}
				>
					{() => <button type="button">Open</button>}
				</PopoverSurface>
			</div>,
		)

		const panel = screen.getByTestId('panel')
		await waitFor(() => {
			const placement = readPanelPlacement(panel)
			expect(panel.style.visibility).toBe('visible')
			expect(placement.top).toBe(viewportRect.top + VIEWPORT_PADDING)
			expect(placement.left).toBe(viewportRect.left + VIEWPORT_PADDING)
		})
		const placement = readPanelPlacement(panel)
		expect(placement.availableHeight).toBe(viewportRect.height - VIEWPORT_PADDING * 2)
		expect(placement.availableWidth).toBe(viewportRect.width - VIEWPORT_PADDING * 2)
	})

	it('publishes window viewport popover size budgets from the safe-area-aware clamp box', async () => {
		const viewportRect = createRect({ top: 0, left: 0, width: 390, height: 844 })
		const anchorRect = createRect({ top: 20, left: 20, width: 32, height: 24 })
		const panelRect = createRect({ top: 0, left: 0, width: 202, height: 120 })
		vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
		vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
			switch (this.getAttribute('data-testid')) {
				case 'anchor':
					return anchorRect
				case 'panel':
					return panelRect
				default:
					return createRect({ top: 0, left: 0, width: 0, height: 0 })
			}
		})

		render(
			<PopoverSurface open rootProps={{ 'data-testid': 'anchor' }} contentProps={{ 'data-testid': 'panel' }} content={() => <div>Menu</div>}>
				{() => <button type="button">Open</button>}
			</PopoverSurface>,
		)

		const panel = screen.getByTestId('panel')
		await waitFor(() => {
			const placement = readPanelPlacement(panel)
			expect(panel.style.visibility).toBe('visible')
			expect(placement.top).toBe(anchorRect.bottom + 8)
			expect(placement.left).toBe(anchorRect.left)
		})
		const placement = readPanelPlacement(panel)
		expect(placement.availableHeight).toBe(viewportRect.height - VIEWPORT_PADDING * 2)
		expect(placement.availableWidth).toBe(viewportRect.width - VIEWPORT_PADDING * 2)
	})

	it('keeps end-aligned window viewport popovers inside safe-area insets during positioning', async () => {
		const safeAreaInsets = { right: 44, left: 44 }
		const viewportRect = { top: 0, left: safeAreaInsets.left, right: 844 - safeAreaInsets.right, bottom: 390, width: 844 - safeAreaInsets.left - safeAreaInsets.right, height: 390 }
		const anchorRect = createRect({ top: 20, left: 780, width: 48, height: 24 })
		const panelRect = createRect({ top: 0, left: 0, width: 202, height: 120 })
		vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(844)
		vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(390)
		mockSafeAreaInsets(safeAreaInsets)
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
			switch (this.getAttribute('data-testid')) {
				case 'anchor':
					return anchorRect
				case 'panel':
					return panelRect
				default:
					return createRect({ top: 0, left: 0, width: 0, height: 0 })
			}
		})

		render(
			<PopoverSurface
				align="end"
				open
				rootProps={{ 'data-testid': 'anchor' }}
				contentProps={{ 'data-testid': 'panel' }}
				content={() => <div>Menu</div>}
			>
				{() => <button type="button">Open</button>}
			</PopoverSurface>,
		)

		const panel = screen.getByTestId('panel')
		await waitFor(() => {
			const placement = readPanelPlacement(panel)
			expect(panel.style.visibility).toBe('visible')
			expect(placement.top).toBe(anchorRect.bottom + 8)
			expect(placement.left).toBe(viewportRect.right - panelRect.width - VIEWPORT_PADDING)
		})
		const placement = readPanelPlacement(panel)
		expect(placement.availableHeight).toBe(viewportRect.height - VIEWPORT_PADDING * 2)
		expect(placement.availableWidth).toBe(viewportRect.width - VIEWPORT_PADDING * 2)
	})

	it('closes uncontrolled popovers on outside pointer down and reports outside source', async () => {
		const onOpenChange = vi.fn()

		render(
			<div>
				<button type="button">Outside</button>
				<PopoverSurface
					onOpenChange={onOpenChange}
					contentProps={{ 'data-testid': 'panel' }}
					content={() => <div>Menu</div>}
				>
					{({ open, toggle }) => (
						<button type="button" aria-expanded={open} onClick={toggle}>
							Open
						</button>
					)}
				</PopoverSurface>
			</div>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Open' }))

		await waitFor(() => {
			expect(screen.getByTestId('panel')).toBeInTheDocument()
		})
		fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))

		await waitFor(() => {
			expect(screen.queryByTestId('panel')).not.toBeInTheDocument()
		})
		expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'false')
		expect(onOpenChange.mock.calls).toEqual([
			[true, { source: 'trigger' }],
			[false, { source: 'outside' }],
		])
	})

	it('reports trigger and content close sources in controlled mode', async () => {
		const onOpenChange = vi.fn()

		function Example() {
			const [open, setOpen] = useState(false)
			return (
				<PopoverSurface
					open={open}
					onOpenChange={(next, info) => {
						onOpenChange(next, info)
						setOpen(next)
					}}
					contentProps={{ 'data-testid': 'panel' }}
					content={({ close }) => (
						<button type="button" onClick={() => close('content')}>
							Close from content
						</button>
					)}
				>
					{({ open: visibleOpen, toggle }) => (
						<button type="button" aria-expanded={visibleOpen} onClick={toggle}>
							Open
						</button>
					)}
				</PopoverSurface>
			)
		}

		render(<Example />)

		fireEvent.click(screen.getByRole('button', { name: 'Open' }))

		await waitFor(() => {
			expect(screen.getByTestId('panel')).toBeInTheDocument()
		})
		fireEvent.click(screen.getByRole('button', { name: 'Close from content' }))

		await waitFor(() => {
			expect(screen.queryByTestId('panel')).not.toBeInTheDocument()
		})
		expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'false')
		expect(onOpenChange.mock.calls).toEqual([
			[true, { source: 'trigger' }],
			[false, { source: 'content' }],
		])
	})
})
