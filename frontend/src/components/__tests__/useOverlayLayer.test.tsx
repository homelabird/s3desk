import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useRef, useState, type ReactNode } from 'react'

import { useOverlayLayer } from '../useOverlayLayer'

type TestOverlayProps = {
	open: boolean
	onEscape: () => void
	testId: string
	trapFocus?: boolean
	lockBodyScroll?: boolean
	includeInitialFocus?: boolean
	children?: ReactNode
}

function TestOverlay(props: TestOverlayProps) {
	const {
		open,
		onEscape,
		testId,
		trapFocus = true,
		lockBodyScroll = true,
		includeInitialFocus = true,
		children,
	} = props
	const containerRef = useRef<HTMLDivElement>(null)
	const initialFocusRef = useRef<HTMLButtonElement>(null)

	useOverlayLayer({
		open,
		onEscape,
		containerRef,
		initialFocusRef: includeInitialFocus ? initialFocusRef : undefined,
		lockBodyScroll,
		trapFocus,
	})

	if (!open) return null

	return (
		<div ref={containerRef} role="dialog" tabIndex={-1} data-testid={testId}>
			{includeInitialFocus ? (
				<button ref={initialFocusRef} type="button">
					{testId} initial action
				</button>
			) : null}
			{children}
		</div>
	)
}

afterEach(() => {
	document.body.style.overflow = ''
})

describe('useOverlayLayer', () => {
	it('locks body scroll across nested overlays and only closes the top layer on Escape', async () => {
		function Example() {
			const [outerOpen, setOuterOpen] = useState(true)
			const [innerOpen, setInnerOpen] = useState(true)

			return (
				<>
					<TestOverlay open={outerOpen} onEscape={() => setOuterOpen(false)} testId="outer">
						<button type="button">Outer action</button>
					</TestOverlay>
					<TestOverlay open={innerOpen} onEscape={() => setInnerOpen(false)} testId="inner">
						<button type="button">Inner action</button>
					</TestOverlay>
				</>
			)
		}

		document.body.style.overflow = 'scroll'
		render(<Example />)

		expect(document.body.style.overflow).toBe('hidden')
		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'inner initial action' })).toHaveFocus()
		})

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByTestId('inner')).not.toBeInTheDocument()
		})
		expect(screen.getByTestId('outer')).toBeInTheDocument()
		expect(document.body.style.overflow).toBe('hidden')

		fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true })

		await waitFor(() => {
			expect(screen.queryByTestId('outer')).not.toBeInTheDocument()
		})
		await waitFor(() => {
			expect(document.body.style.overflow).toBe('scroll')
		})
	})

	it('moves focus back to the overlay container when Tab is pressed and no focusable elements exist', async () => {
		render(
			<>
				<button type="button">Outside target</button>
				<TestOverlay open onEscape={() => {}} testId="focusless" includeInitialFocus={false} />
			</>,
		)

		const container = screen.getByTestId('focusless')
		const outsideTarget = screen.getByRole('button', { name: 'Outside target' })

		await waitFor(() => {
			expect(container).toHaveFocus()
		})

		outsideTarget.focus()
		expect(outsideTarget).toHaveFocus()

		fireEvent.keyDown(document, { key: 'Tab', bubbles: true, cancelable: true })

		expect(container).toHaveFocus()
	})

	it('restores focus to the opener when the overlay closes while it still owns focus', async () => {
		function Example(props: { open: boolean }) {
			return (
				<>
					<button type="button">Opener</button>
					<TestOverlay open={props.open} onEscape={() => {}} testId="restoring-overlay">
						<button type="button">Overlay action</button>
					</TestOverlay>
				</>
			)
		}

		const { rerender } = render(<Example open={false} />)
		const opener = screen.getByRole('button', { name: 'Opener' })
		opener.focus()

		rerender(<Example open />)

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'restoring-overlay initial action' })).toHaveFocus()
		})

		rerender(<Example open={false} />)

		await waitFor(() => {
			expect(opener).toHaveFocus()
		})
	})

	it('does not steal focus back to the opener when focus has moved outside the overlay before close', async () => {
		function Example(props: { open: boolean }) {
			return (
				<>
					<button type="button">Opener</button>
					<button type="button">Outside target</button>
					<TestOverlay open={props.open} onEscape={() => {}} testId="non-restoring-overlay">
						<button type="button">Overlay action</button>
					</TestOverlay>
				</>
			)
		}

		const { rerender } = render(<Example open={false} />)
		const opener = screen.getByRole('button', { name: 'Opener' })
		const outsideTarget = screen.getByRole('button', { name: 'Outside target' })
		opener.focus()

		rerender(<Example open />)

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'non-restoring-overlay initial action' })).toHaveFocus()
		})

		outsideTarget.focus()
		expect(outsideTarget).toHaveFocus()

		rerender(<Example open={false} />)

		await waitFor(() => {
			expect(outsideTarget).toHaveFocus()
		})
		expect(opener).not.toHaveFocus()
	})
})
