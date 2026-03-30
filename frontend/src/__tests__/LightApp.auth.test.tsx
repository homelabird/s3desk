import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { createLightAPIClientMock } = vi.hoisted(() => ({
	createLightAPIClientMock: vi.fn(),
}))

vi.mock('../api/lightClient', () => ({
	createLightAPIClient: createLightAPIClientMock,
}))

import { APIError } from '../api/client'
import LightApp from '../LightApp'
import { serverScopedStorageKey } from '../lib/profileScopedStorage'
import { ensureDomShims } from '../test/domShims'
import { ThemeModeProvider } from '../themeMode'

const originalMatchMedia = window.matchMedia

beforeAll(() => {
	ensureDomShims()
})

beforeEach(() => {
	createLightAPIClientMock.mockReset()
	createLightAPIClientMock.mockImplementation(({ apiToken }: { apiToken: string }) => ({
		server: {
			getMeta: vi.fn().mockRejectedValue(
				new APIError({
					status: 401,
					code: 'unauthorized',
					message: apiToken ? 'invalid token' : 'missing token',
				}),
			),
		},
		profiles: {
			listProfiles: vi.fn().mockResolvedValue([]),
		},
	}))
})

afterEach(() => {
	window.matchMedia = originalMatchMedia
	window.localStorage.clear()
	window.sessionStorage.clear()
	vi.restoreAllMocks()
})

function mockViewportWidth(width: number) {
	window.matchMedia = vi.fn().mockImplementation((query: string): MediaQueryList => {
		if (query.includes('prefers-color-scheme')) {
			return {
				matches: false,
				media: query,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			}
		}

		const minMatch = query.match(/\(min-width:\s*(\d+)px\)/)
		const maxMatch = query.match(/\(max-width:\s*(\d+)px\)/)
		let matches = true
		if (minMatch) matches &&= width >= Number(minMatch[1])
		if (maxMatch) matches &&= width <= Number(maxMatch[1])
		return {
			matches,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}
	})
}

describe('LightApp auth gate', () => {
	it('remounts the login form after clearing a saved token', async () => {
		mockViewportWidth(1280)
		window.localStorage.setItem('apiToken', JSON.stringify('saved-token'))
		window.sessionStorage.setItem('transfersHistoryV1', JSON.stringify({ version: 1, savedAtMs: 1, downloads: [], uploads: [] }))
		window.localStorage.setItem('transfersHistoryV1', JSON.stringify({ version: 1, savedAtMs: 1, downloads: [], uploads: [] }))

		render(
			<ThemeModeProvider>
				<MemoryRouter>
					<LightApp />
				</MemoryRouter>
			</ThemeModeProvider>,
		)

		expect(await screen.findByDisplayValue('saved-token')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Clear stored token' }))

		await waitFor(() => {
			expect(screen.getByPlaceholderText('API_TOKEN…')).toHaveValue('')
		})
		expect(createLightAPIClientMock).toHaveBeenLastCalledWith({ apiToken: '' })
		expect(window.sessionStorage.getItem('transfersHistoryV1')).toBeNull()
		expect(window.localStorage.getItem('transfersHistoryV1')).toBeNull()
	})

	it('uses the server-scoped stored active profile after the api token changes', async () => {
		mockViewportWidth(1280)
		createLightAPIClientMock.mockReset()
		createLightAPIClientMock.mockImplementation(({ apiToken }: { apiToken: string }) => ({
			server: {
				getMeta: vi.fn().mockResolvedValue({ apiToken }),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([
					{ id: 'profile-1', name: 'Primary Profile', provider: 's3_compatible' },
					{ id: 'profile-2', name: 'Archive Profile', provider: 's3_compatible' },
				]),
			},
		}))
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-a', 'profileId'), JSON.stringify('profile-1'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-b', 'profileId'), JSON.stringify('profile-2'))

		render(
			<ThemeModeProvider>
				<MemoryRouter>
					<LightApp />
				</MemoryRouter>
			</ThemeModeProvider>,
		)

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Primary Profile.*profile-1/i })).toHaveAttribute('aria-pressed', 'true')
		})

		window.sessionStorage.setItem('apiToken', JSON.stringify('token-b'))
		window.dispatchEvent(
			new CustomEvent('session-storage', {
				detail: { key: 'apiToken', value: JSON.stringify('token-b') },
			}),
		)

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Archive Profile.*profile-2/i })).toHaveAttribute('aria-pressed', 'true')
		})
	})

	it('still migrates the matching legacy global active profile when another server already has a scoped key', async () => {
		mockViewportWidth(1280)
		createLightAPIClientMock.mockReset()
		createLightAPIClientMock.mockImplementation(({ apiToken }: { apiToken: string }) => ({
			server: {
				getMeta: vi.fn().mockResolvedValue({ apiToken }),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([
					{ id: 'profile-2', name: 'Archive Profile', provider: 's3_compatible' },
					{ id: 'profile-1', name: 'Primary Profile', provider: 's3_compatible' },
				]),
			},
		}))
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-1'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-b', 'profileId'), JSON.stringify('profile-other-server'))

		render(
			<ThemeModeProvider>
				<MemoryRouter>
					<LightApp />
				</MemoryRouter>
			</ThemeModeProvider>,
		)

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Primary Profile.*profile-1/i })).toHaveAttribute('aria-pressed', 'true')
		})
	})

	it('migrates the legacy global active profile when the matching legacy token exists only in sessionStorage', async () => {
		mockViewportWidth(1280)
		createLightAPIClientMock.mockReset()
		createLightAPIClientMock.mockImplementation(({ apiToken }: { apiToken: string }) => ({
			server: {
				getMeta: vi.fn().mockResolvedValue({ apiToken }),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([
					{ id: 'profile-2', name: 'Archive Profile', provider: 's3_compatible' },
					{ id: 'profile-1', name: 'Primary Profile', provider: 's3_compatible' },
				]),
			},
		}))
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-1'))

		render(
			<ThemeModeProvider>
				<MemoryRouter>
					<LightApp />
				</MemoryRouter>
			</ThemeModeProvider>,
		)

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Primary Profile.*profile-1/i })).toHaveAttribute('aria-pressed', 'true')
		})
	})

	it('ignores the legacy global active profile when the current server token differs', async () => {
		mockViewportWidth(1280)
		createLightAPIClientMock.mockReset()
		createLightAPIClientMock.mockImplementation(({ apiToken }: { apiToken: string }) => ({
			server: {
				getMeta: vi.fn().mockResolvedValue({ apiToken }),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([
					{ id: 'profile-1', name: 'Primary Profile', provider: 's3_compatible' },
					{ id: 'profile-2', name: 'Archive Profile', provider: 's3_compatible' },
				]),
			},
		}))
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-b'))
		window.localStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-1'))

		render(
			<ThemeModeProvider>
				<MemoryRouter>
					<LightApp />
				</MemoryRouter>
			</ThemeModeProvider>,
		)

		await waitFor(() => {
			expect(screen.getByText('No profile selected')).toBeInTheDocument()
		})
		expect(screen.getByRole('button', { name: 'buckets' })).toBeDisabled()
	})

	it('clears an invalid stored active profile when the current server profile list no longer contains it', async () => {
		mockViewportWidth(1280)
		createLightAPIClientMock.mockReset()
		createLightAPIClientMock.mockImplementation(({ apiToken }: { apiToken: string }) => ({
			server: {
				getMeta: vi.fn().mockResolvedValue({ apiToken }),
			},
			profiles: {
				listProfiles: vi.fn().mockResolvedValue([{ id: 'profile-1', name: 'Primary Profile', provider: 's3_compatible' }]),
			},
		}))
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-a', 'profileId'), JSON.stringify('profile-missing'))

		render(
			<ThemeModeProvider>
				<MemoryRouter>
					<LightApp />
				</MemoryRouter>
			</ThemeModeProvider>,
		)

		await waitFor(() => {
			expect(screen.getByText('No profile selected')).toBeInTheDocument()
		})
		expect(screen.getByRole('button', { name: 'buckets' })).toBeDisabled()
		await waitFor(() => {
			expect(window.localStorage.getItem(serverScopedStorageKey('app', 'token-a', 'profileId'))).toBe('null')
		})
	})
})
