import type { CSSProperties, ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('antd', () => ({
	Alert: (props: { title?: ReactNode; type?: string; style?: CSSProperties }) => (
		<div data-testid="job-queue-alert" data-type={props.type ?? ''} style={props.style}>
			{props.title}
		</div>
	),
}))

import { clearJobQueueBanner, publishJobQueueBanner } from '../../lib/jobQueue'
import { JobQueueBanner } from '../JobQueueBanner'

describe('JobQueueBanner', () => {
	it('shows and clears the banner via events', () => {
		const message = 'Queue full (1/2). Retrying…'

		render(<JobQueueBanner />)
		expect(screen.queryByText(message)).not.toBeInTheDocument()

		act(() => {
			publishJobQueueBanner({ message, type: 'warning' })
		})

		expect(screen.getByText(message)).toBeInTheDocument()

		act(() => {
			clearJobQueueBanner()
		})

		expect(screen.queryByText(message)).not.toBeInTheDocument()
	}, 20_000)

	it('defaults to a warning alert when no type is provided', () => {
		render(<JobQueueBanner />)

		act(() => {
			publishJobQueueBanner({ message: 'Queue warming up' })
		})

		const alert = screen.getByTestId('job-queue-alert')
		expect(alert).toHaveAttribute('data-type', 'warning')
		expect(alert).toHaveTextContent('Queue warming up')
	})

	it('passes through an explicit info banner type', () => {
		render(<JobQueueBanner />)

		act(() => {
			publishJobQueueBanner({ message: 'Queue draining normally', type: 'info' })
		})

		expect(screen.getByTestId('job-queue-alert')).toHaveAttribute('data-type', 'info')
	})
})
