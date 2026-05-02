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

	it('renders the onboarding steps with their descriptions', () => {
		render(<WelcomeScreen onGetStarted={vi.fn()} />)

		expect(screen.getByText('Create a profile')).toBeInTheDocument()
		expect(screen.getByText('A profile stores your storage endpoint and credentials (S3, Azure, GCS, etc.).')).toBeInTheDocument()
		expect(screen.getByText('Browse buckets')).toBeInTheDocument()
		expect(screen.getByText('List buckets, navigate folders, and preview objects.')).toBeInTheDocument()
		expect(screen.getByText('Upload & transfer')).toBeInTheDocument()
		expect(screen.getByText('Upload files, create sync/copy jobs, and track progress.')).toBeInTheDocument()
	})

	it('keeps the CTA actionable across hover transitions', () => {
		const onGetStarted = vi.fn()
		render(<WelcomeScreen onGetStarted={onGetStarted} />)

		const cta = screen.getByRole('button', { name: 'Get started — Create your first profile' })
		expect(cta).toBeEnabled()

		fireEvent.mouseEnter(cta)
		fireEvent.click(cta)

		fireEvent.mouseLeave(cta)
		expect(onGetStarted).toHaveBeenCalledTimes(1)
	})
})
