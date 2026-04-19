import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { APIError } from '../api/client'
import { FullAppBootstrapGate } from '../FullAppBootstrapGate'

type RenderGateOptions = {
	metaPending?: boolean
	metaError?: unknown
	profileGate?: ReactNode
	profilesPending?: boolean
	onRetry?: () => void
}

function renderGate(options: RenderGateOptions = {}) {
	return render(
		<FullAppBootstrapGate
			metaPending={options.metaPending ?? false}
			metaError={options.metaError ?? null}
			onRetry={options.onRetry ?? vi.fn()}
			apiToken="token-a"
			setApiToken={vi.fn()}
			profileGate={options.profileGate ?? null}
			profilesPending={options.profilesPending ?? false}
		>
			<div data-testid="shell-content">shell content</div>
		</FullAppBootstrapGate>,
	)
}

describe('FullAppBootstrapGate', () => {
	it('renders the backend error panel and retries for 403 responses', () => {
		const onRetry = vi.fn()

		renderGate({
			metaError: new APIError({
				status: 403,
				code: 'forbidden',
				message: 'loopback only',
			}),
			onRetry,
		})

		expect(screen.getByText('Backend connection failed')).toBeInTheDocument()
		expect(screen.getByText('forbidden: loopback only')).toBeInTheDocument()
		expect(screen.getByText('Access blocked by server policy.')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
		expect(onRetry).toHaveBeenCalledTimes(1)
	})

	it('renders the profile gate once profiles finish loading', () => {
		renderGate({
			profileGate: <div data-testid="profile-gate">select a profile</div>,
			profilesPending: false,
		})

		expect(screen.getByTestId('profile-gate')).toHaveTextContent('select a profile')
		expect(screen.queryByTestId('shell-content')).not.toBeInTheDocument()
	})

	it('renders children when bootstrap checks pass', () => {
		renderGate()

		expect(screen.getByTestId('shell-content')).toHaveTextContent('shell content')
	})
})
