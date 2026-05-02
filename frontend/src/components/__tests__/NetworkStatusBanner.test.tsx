import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearNetworkStatus, publishNetworkStatus } from '../../lib/networkStatus'
import { NetworkStatusBanner } from '../NetworkStatusBanner'

afterEach(() => {
	clearNetworkStatus()
	vi.useRealTimers()
})

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
	}, 20_000)

	it('uses the default unstable message and auto clears it after the unstable ttl', () => {
		vi.useFakeTimers()
		render(<NetworkStatusBanner />)

		act(() => {
			publishNetworkStatus({ kind: 'unstable', message: '' })
		})

		expect(screen.getByText('Network unstable. Some requests may fail.')).toBeInTheDocument()

		act(() => {
			vi.advanceTimersByTime(10_000)
		})

		expect(screen.queryByText('Network unstable. Some requests may fail.')).not.toBeInTheDocument()
	})

	it('auto clears the online banner after the shorter success ttl', () => {
		vi.useFakeTimers()
		render(<NetworkStatusBanner />)

		act(() => {
			window.dispatchEvent(new Event('online'))
		})

		expect(screen.getByText('Back online.')).toBeInTheDocument()

		act(() => {
			vi.advanceTimersByTime(3_000)
		})

		expect(screen.queryByText('Back online.')).not.toBeInTheDocument()
	})
})
