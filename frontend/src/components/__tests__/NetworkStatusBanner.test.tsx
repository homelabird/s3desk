import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { clearNetworkStatus } from '../../lib/networkStatus'
import { NetworkStatusBanner } from '../NetworkStatusBanner'

describe('NetworkStatusBanner', () => {
	it('reacts to online/offline events and clear', () => {
		render(<NetworkStatusBanner />)

		expect(screen.queryByText('Offline. Check your network connection.')).not.toBeInTheDocument()

		act(() => {
			window.dispatchEvent(new Event('offline'))
		})

		expect(screen.getByText('Offline. Check your network connection.')).toBeInTheDocument()

		act(() => {
			window.dispatchEvent(new Event('online'))
		})

		expect(screen.getByText('Back online.')).toBeInTheDocument()

		act(() => {
			clearNetworkStatus()
		})

		expect(screen.queryByText('Back online.')).not.toBeInTheDocument()
	})
})
