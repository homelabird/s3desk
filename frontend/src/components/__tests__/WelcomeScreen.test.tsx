import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WelcomeScreen } from '../WelcomeScreen'

describe('WelcomeScreen', () => {
	it('renders the welcome message', () => {
		render(<WelcomeScreen onGetStarted={vi.fn()} />)
		expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
		expect(screen.getByText('Welcome to S3Desk')).toBeInTheDocument()
	})

	it('renders the three onboarding steps', () => {
		render(<WelcomeScreen onGetStarted={vi.fn()} />)
		expect(screen.getByText('Create a profile')).toBeInTheDocument()
		expect(screen.getByText('Browse buckets')).toBeInTheDocument()
		expect(screen.getByText('Upload & transfer')).toBeInTheDocument()
	})

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
