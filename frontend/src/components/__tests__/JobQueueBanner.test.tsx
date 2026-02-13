import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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
	})
})
