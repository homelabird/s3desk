import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../pages/JobsPage', async () => {
	const React = await import('react')
	const { useLocation, useNavigate } = await import('react-router-dom')

	return {
		JobsPage: function JobsPageMock(props: { apiToken: string }) {
			const location = useLocation()
			const navigate = useNavigate()
			const [seededState] = React.useState(() => location.state ?? null)
			const [seededToken] = React.useState(() => props.apiToken)

			return (
				<div>
					<div data-testid="jobs-route-seeded-token">{seededToken}</div>
					<pre data-testid="jobs-route-seeded-state">{JSON.stringify(seededState)}</pre>
					<button
						type="button"
						onClick={() =>
							navigate('/jobs', {
								state: { openDeleteJob: true, bucket: 'next-bucket', deleteAll: true },
							})
						}
					>
						Push jobs route state
					</button>
				</div>
			)
		},
	}
})

vi.mock('../pages/ProfilesPage', async () => {
	const React = await import('react')

	return {
		ProfilesPage: function ProfilesPageMock(props: { apiToken: string }) {
			const [seededToken] = React.useState(() => props.apiToken)
			return <div data-testid="profiles-route-seeded-token">{seededToken}</div>
		},
	}
})

vi.mock('../pages/BucketsPage', async () => {
	const React = await import('react')

	return {
		BucketsPage: function BucketsPageMock(props: { apiToken: string; profileId: string | null }) {
			const [seededScope] = React.useState(() => `${props.apiToken}:${props.profileId ?? 'none'}`)
			return <div data-testid="buckets-route-seeded-scope">{seededScope}</div>
		},
	}
})

vi.mock('../pages/ObjectsPage', async () => {
	const React = await import('react')

	return {
		ObjectsPage: function ObjectsPageMock(props: { apiToken: string; profileId: string | null }) {
			const [seededScope] = React.useState(() => `${props.apiToken}:${props.profileId ?? 'none'}`)
			return <div data-testid="objects-route-seeded-scope">{seededScope}</div>
		},
	}
})

vi.mock('../pages/UploadsPage', async () => {
	const React = await import('react')

	return {
		UploadsPage: function UploadsPageMock(props: { apiToken: string; profileId: string | null }) {
			const [seededScope] = React.useState(() => `${props.apiToken}:${props.profileId ?? 'none'}`)
			return <div data-testid="uploads-route-seeded-scope">{seededScope}</div>
		},
	}
})

vi.mock('../pages/LoginPage', async () => {
	const React = await import('react')

	return {
		LoginPage: function LoginPageMock(props: { initialToken: string; onClearSavedToken?: () => void }) {
			const [seededToken] = React.useState(() => props.initialToken ?? '')

			return (
				<div>
					<div data-testid="full-shell-login-seeded-token">{seededToken}</div>
					<button type="button" onClick={props.onClearSavedToken}>
						Clear stored token
					</button>
				</div>
			)
		},
	}
})

vi.mock('../components/TransfersShell', async () => {
	const React = await import('react')

	return {
		TransfersProvider: function TransfersProviderMock(props: { apiToken: string; children: ReactNode }) {
			const [seededToken] = React.useState(() => props.apiToken)
			return (
				<div data-testid="transfers-runtime-seeded-token">
					{seededToken}
					{props.children}
				</div>
			)
		},
		TransfersButton: function TransfersButtonMock(props: { ariaLabel?: string; showLabel?: boolean; className?: string }) {
			return (
				<button type="button" aria-label={props.ariaLabel ?? 'Transfers'} className={props.className}>
					{props.showLabel ? 'Transfers' : 'Transfers'}
				</button>
			)
		},
	}
})

vi.mock('../components/SettingsDrawer', async () => {
	return {
		SettingsDrawer: function SettingsDrawerMock(props: {
			open: boolean
			onClose: () => void
			setApiToken: (token: string) => void
		}) {
			if (!props.open) return null
			return (
				<div data-testid="settings-drawer-mock">
					<button type="button" onClick={() => props.setApiToken('token-b')}>
						Switch API token
					</button>
					<button type="button" onClick={props.onClose}>
						Close settings
					</button>
				</div>
			)
		},
	}
})

import { APIClient, APIError } from '../api/client'
import FullAppInner from '../FullAppInner'
import { serverScopedStorageKey } from '../lib/profileScopedStorage'
import { ensureDomShims } from '../test/domShims'
import { ThemeModeProvider } from '../themeMode'

const originalMatchMedia = window.matchMedia

beforeAll(() => {
	ensureDomShims()
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

function mockAuthorizedShellApi(profileIds: string[] = ['profile-1']) {
	const now = '2024-01-01T00:00:00Z'
	vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
		getMeta: vi.fn().mockResolvedValue({
			version: 'test',
			serverAddr: '127.0.0.1:8080',
			dataDir: '/data',
			staticDir: '/app/ui',
			apiTokenEnabled: true,
			encryptionEnabled: false,
			capabilities: {
				profileTls: { enabled: false, reason: 'test' },
				providers: {},
			},
			allowedLocalDirs: [],
			jobConcurrency: 1,
			uploadSessionTTLSeconds: 3600,
			uploadDirectStream: false,
			transferEngine: {
				name: 'rclone',
				available: true,
				compatible: true,
				minVersion: '1.52.0',
				path: '/usr/bin/rclone',
				version: 'v1.66.0',
			},
		} as never),
	} as never)
	vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({
		listProfiles: vi.fn().mockResolvedValue(
			profileIds.map((id, index) => ({
				id,
				name: index === 0 ? 'Primary Profile' : `Profile ${index + 1}`,
				provider: 's3_compatible',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: true,
				createdAt: now,
				updatedAt: now,
			})) as never,
		),
	} as never)
}

function mockUnauthorizedShellApi() {
	vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
		getMeta: vi.fn().mockRejectedValue(
			new APIError({
				status: 401,
				code: 'unauthorized',
				message: 'invalid token',
			}),
		),
	} as never)
	vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({
		listProfiles: vi.fn().mockResolvedValue([] as never[]),
	} as never)
}

function renderShell(initialEntries: Array<string | { pathname: string; state?: unknown }>, apiToken = 'token') {
	window.localStorage.setItem('apiToken', JSON.stringify(apiToken))
	window.localStorage.setItem('profileId', JSON.stringify('profile-1'))

	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	})

	render(
		<QueryClientProvider client={client}>
			<ConfigProvider getPopupContainer={() => document.body}>
				<ThemeModeProvider>
					<MemoryRouter initialEntries={initialEntries}>
						<FullAppInner />
					</MemoryRouter>
				</ThemeModeProvider>
			</ConfigProvider>
		</QueryClientProvider>,
	)
}

describe('FullAppInner route remounts', () => {
	it('uses the current server-scoped stored active profile on initial render', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi(['profile-1', 'profile-2'])
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-b'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-b', 'profileId'), JSON.stringify('profile-2'))

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<ConfigProvider getPopupContainer={() => document.body}>
					<ThemeModeProvider>
						<MemoryRouter initialEntries={['/objects']}>
							<FullAppInner />
						</MemoryRouter>
					</ThemeModeProvider>
				</ConfigProvider>
			</QueryClientProvider>,
		)

		await waitFor(() => {
			expect(screen.getByTestId('objects-route-seeded-scope')).toHaveTextContent('token-b:profile-2')
		})
	})

	it('ignores a mismatched legacy global active profile during migration fallback', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi(['profile-2', 'profile-1'])
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-b'))
		window.localStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-1'))

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<ConfigProvider getPopupContainer={() => document.body}>
					<ThemeModeProvider>
						<MemoryRouter initialEntries={['/objects']}>
							<FullAppInner />
						</MemoryRouter>
					</ThemeModeProvider>
				</ConfigProvider>
			</QueryClientProvider>,
		)

		await waitFor(() => {
			expect(screen.getByTestId('objects-route-seeded-scope')).toHaveTextContent('token-b:profile-2')
		})
	})

	it('still migrates the matching legacy global active profile even when another server already has a scoped key', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi(['profile-2', 'profile-1'])
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-1'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-b', 'profileId'), JSON.stringify('profile-other-server'))

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<ConfigProvider getPopupContainer={() => document.body}>
					<ThemeModeProvider>
						<MemoryRouter initialEntries={['/objects']}>
							<FullAppInner />
						</MemoryRouter>
					</ThemeModeProvider>
				</ConfigProvider>
			</QueryClientProvider>,
		)

		await waitFor(() => {
			expect(screen.getByTestId('objects-route-seeded-scope')).toHaveTextContent('token-a:profile-1')
		})
	})

	it('migrates the legacy global active profile when the matching legacy token exists only in sessionStorage', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi(['profile-2', 'profile-1'])
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-1'))

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<ConfigProvider getPopupContainer={() => document.body}>
					<ThemeModeProvider>
						<MemoryRouter initialEntries={['/objects']}>
							<FullAppInner />
						</MemoryRouter>
					</ThemeModeProvider>
				</ConfigProvider>
			</QueryClientProvider>,
		)

		await waitFor(() => {
			expect(screen.getByTestId('objects-route-seeded-scope')).toHaveTextContent('token-a:profile-1')
		})
	})

	it('clears the stored active profile when the current server has no profiles', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi([])
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-a', 'profileId'), JSON.stringify('profile-1'))

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<ConfigProvider getPopupContainer={() => document.body}>
					<ThemeModeProvider>
						<MemoryRouter initialEntries={['/profiles']}>
							<FullAppInner />
						</MemoryRouter>
					</ThemeModeProvider>
				</ConfigProvider>
			</QueryClientProvider>,
		)

		await waitFor(() => {
			expect(window.localStorage.getItem(serverScopedStorageKey('app', 'token-a', 'profileId'))).toBe('null')
		})
	})

	it('remounts JobsPage when same-path navigation pushes new location.state', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi()

		renderShell([{ pathname: '/jobs', state: { openDeleteJob: true, bucket: 'primary-bucket', deleteAll: true } }])

		expect(await screen.findByTestId('jobs-route-seeded-state')).toHaveTextContent('"bucket":"primary-bucket"')

		fireEvent.click(screen.getByRole('button', { name: 'Push jobs route state' }))

		await waitFor(() => {
			expect(screen.getByTestId('jobs-route-seeded-state')).toHaveTextContent('"bucket":"next-bucket"')
		})
	})

	it('remounts the jobs route after the api token changes', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi()

		renderShell(['/jobs'], 'token-a')

		expect(await screen.findByTestId('jobs-route-seeded-token')).toHaveTextContent('token-a')

		fireEvent.click(screen.getByRole('button', { name: /Settings/i }))
		fireEvent.click(await screen.findByRole('button', { name: 'Switch API token' }))

		await waitFor(() => {
			expect(screen.getByTestId('jobs-route-seeded-token')).toHaveTextContent('token-b')
		})
	})

	it('remounts the login gate after clearing the stored token', async () => {
		mockViewportWidth(1280)
		mockUnauthorizedShellApi()
		window.sessionStorage.setItem('transfersHistoryV1', JSON.stringify({ version: 1, savedAtMs: 1, downloads: [], uploads: [] }))
		window.localStorage.setItem('transfersHistoryV1', JSON.stringify({ version: 1, savedAtMs: 1, downloads: [], uploads: [] }))

		renderShell(['/profiles'], 'saved-token')

		expect(await screen.findByTestId('full-shell-login-seeded-token')).toHaveTextContent('saved-token')

		fireEvent.click(screen.getByRole('button', { name: 'Clear stored token' }))

		await waitFor(() => {
			expect(screen.getByTestId('full-shell-login-seeded-token')).toHaveTextContent('')
		})
		expect(window.sessionStorage.getItem('transfersHistoryV1')).toBeNull()
		expect(window.localStorage.getItem('transfersHistoryV1')).toBeNull()
	})

	it('remounts the transfers runtime after the api token changes', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi()
		window.sessionStorage.setItem('transfersHistoryV1', JSON.stringify({ version: 1, savedAtMs: 1, downloads: [], uploads: [] }))
		window.localStorage.setItem('transfersHistoryV1', JSON.stringify({ version: 1, savedAtMs: 1, downloads: [], uploads: [] }))

		renderShell(['/profiles'], 'token-a')

		expect(await screen.findByTestId('transfers-runtime-seeded-token')).toHaveTextContent('token-a')

		fireEvent.click(screen.getByRole('button', { name: /Settings/ }))
		fireEvent.click(await screen.findByRole('button', { name: 'Switch API token' }))

		await waitFor(() => {
			expect(screen.getByTestId('transfers-runtime-seeded-token')).toHaveTextContent('token-b')
		})
		expect(window.sessionStorage.getItem('transfersHistoryV1')).toBeNull()
		expect(window.localStorage.getItem('transfersHistoryV1')).toBeNull()
	})

	it('remounts the profiles route after the api token changes', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi()

		renderShell(['/profiles'], 'token-a')

		expect(await screen.findByTestId('profiles-route-seeded-token')).toHaveTextContent('token-a')

		fireEvent.click(screen.getByRole('button', { name: /Settings/i }))
		fireEvent.click(await screen.findByRole('button', { name: 'Switch API token' }))

		await waitFor(() => {
			expect(screen.getByTestId('profiles-route-seeded-token')).toHaveTextContent('token-b')
		})
	})

	it('remounts the buckets route after the api token changes', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi()

		renderShell(['/buckets'], 'token-a')

		expect(await screen.findByTestId('buckets-route-seeded-scope')).toHaveTextContent('token-a:profile-1')

		fireEvent.click(screen.getByRole('button', { name: /Settings/i }))
		fireEvent.click(await screen.findByRole('button', { name: 'Switch API token' }))

		await waitFor(() => {
			expect(screen.getByTestId('buckets-route-seeded-scope')).toHaveTextContent('token-b:profile-1')
		})
	})

	it('remounts the objects route after the api token changes', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi()

		renderShell(['/objects'], 'token-a')

		expect(await screen.findByTestId('objects-route-seeded-scope')).toHaveTextContent('token-a:profile-1')

		fireEvent.click(screen.getByRole('button', { name: /Settings/i }))
		fireEvent.click(await screen.findByRole('button', { name: 'Switch API token' }))

		await waitFor(() => {
			expect(screen.getByTestId('objects-route-seeded-scope')).toHaveTextContent('token-b:profile-1')
		})
	})

	it('remounts the uploads route after the api token changes', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi()

		renderShell(['/uploads'], 'token-a')

		expect(await screen.findByTestId('uploads-route-seeded-scope')).toHaveTextContent('token-a:profile-1')

		fireEvent.click(screen.getByRole('button', { name: /Settings/i }))
		fireEvent.click(await screen.findByRole('button', { name: 'Switch API token' }))

		await waitFor(() => {
			expect(screen.getByTestId('uploads-route-seeded-scope')).toHaveTextContent('token-b:profile-1')
		})
	})

	it('opens settings from the redirected /settings route and closes it after the api token changes', async () => {
		mockViewportWidth(1280)
		mockAuthorizedShellApi()

		renderShell(['/settings'], 'token-a')

		expect(await screen.findByTestId('settings-drawer-mock')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Switch API token' }))

		await waitFor(() => {
			expect(screen.queryByTestId('settings-drawer-mock')).not.toBeInTheDocument()
		})
	})

	it('closes the mobile navigation drawer after the api token changes', async () => {
		mockViewportWidth(640)
		mockAuthorizedShellApi()

		renderShell(['/profiles'], 'token-a')

		fireEvent.click(await screen.findByRole('button', { name: 'Open navigation' }))

		expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
		fireEvent.click(await screen.findByRole('menuitem', { name: /Settings/i }))
		fireEvent.click(await screen.findByRole('button', { name: 'Switch API token' }))

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
		})
	})
})
