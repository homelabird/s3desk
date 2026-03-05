import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WelcomeScreen } from '../WelcomeScreen'

describe('WelcomeScreen', () => {
	it('calls onGetStarted when the CTA button is clicked', () => {
		const onGetStarted = vi.fn()
		render(<WelcomeScreen onGetStarted={onGetStarted} />)
		fireEvent.click(screen.getByTestId('welcome-get-started'))
		expect(onGetStarted).toHaveBeenCalledTimes(1)
	})

	it('uses a semantic heading for the title', () => {
		render(<WelcomeScreen onGetStarted={vi.fn()} />)
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Welcome to S3Desk')
	})
})
