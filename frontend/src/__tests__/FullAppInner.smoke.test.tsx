import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../api/client'
import { APIClientProvider } from '../api/APIClientProvider'
import { AuthProvider } from '../auth/AuthProvider'
import FullAppInner from '../FullAppInner'
import { ensureDomShims } from '../test/domShims'
import { ThemeModeProvider } from '../themeMode'

const originalMatchMedia = window.matchMedia

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	window.matchMedia = originalMatchMedia
	window.localStorage.clear()
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

function mockShellApi() {
	const now = '2024-01-01T00:00:00Z'
	const getMeta = vi.fn().mockResolvedValue({
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
	} as never)
	const listProfiles = vi.fn().mockResolvedValue([
		{
			id: 'profile-1',
			name: 'Primary Profile With A Very Long Name',
			provider: 's3_compatible',
			endpoint: 'http://127.0.0.1:9000',
			region: 'us-east-1',
			forcePathStyle: true,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: true,
			createdAt: now,
			updatedAt: now,
		},
	] as never)

	vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
		getBootstrap: vi.fn().mockImplementation(async () => ({
			meta: await getMeta(),
			profiles: await listProfiles(),
		})),
		getMeta,
	} as never)
	vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({
		listProfiles,
	} as never)
}

function renderShell(initialPath = '/profiles') {
	window.localStorage.setItem('apiToken', JSON.stringify('token'))
	window.localStorage.setItem('profileId', JSON.stringify('profile-1'))

	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	})

	render(
		<QueryClientProvider client={client}>
			<ConfigProvider getPopupContainer={() => document.body}>
				<AuthProvider>
					<APIClientProvider>
						<ThemeModeProvider>
							<MemoryRouter initialEntries={[initialPath]}>
								<FullAppInner />
							</MemoryRouter>
						</ThemeModeProvider>
					</APIClientProvider>
				</AuthProvider>
			</ConfigProvider>
		</QueryClientProvider>,
	)
}

describe('FullAppInner header', () => {
	it('stacks profile actions into a second row on narrow mobile screens', async () => {
		mockViewportWidth(390)
		mockShellApi()

		renderShell()

		expect(await screen.findByTestId('app-header-profile-row')).toBeInTheDocument()
		const navButton = screen.getByRole('button', { name: 'Open navigation' })
		expect(navButton).toHaveAttribute('aria-haspopup', 'dialog')
		expect(navButton).toHaveAttribute('aria-expanded', 'false')
		expect(navButton).toHaveAttribute('aria-controls', 'app-navigation-drawer')
		expect(screen.getByRole('link', { name: 'Open objects workspace' })).toHaveAttribute('href', '/objects')
		expect(screen.getByRole('combobox', { name: 'Profile' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Transfers' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
		const appMenuButton = screen.getByRole('button', { name: 'App menu' })
		expect(appMenuButton).toHaveAttribute('aria-haspopup', 'menu')
		expect(appMenuButton).toHaveAttribute('aria-expanded', 'false')

		await act(async () => {
			fireEvent.click(appMenuButton)
		})

		expect(appMenuButton).toHaveAttribute('aria-expanded', 'true')
		expect(await screen.findByRole('menuitem', { name: /Settings/i })).toBeInTheDocument()
		expect(screen.getByRole('menuitem', { name: /Dark mode/i })).toBeInTheDocument()
		expect(screen.getByRole('menuitem', { name: /Logout/i })).toBeInTheDocument()

		await act(async () => {
			fireEvent.click(screen.getByRole('menuitem', { name: /Logout/i }))
		})

		expect(await screen.findByRole('dialog', { name: 'Log out of this session?' })).toBeInTheDocument()
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
		})
		expect(screen.queryByRole('dialog', { name: 'Log out of this session?' })).not.toBeInTheDocument()

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
		})

		expect(navButton).toHaveAttribute('aria-expanded', 'true')
		expect(await screen.findByRole('dialog', { name: 'Navigation' })).toHaveAttribute('id', 'app-navigation-drawer')
		expect(screen.queryByRole('button', { name: 'Backup' })).not.toBeInTheDocument()
	}, 15_000)

	it('keeps a compact single-row header on tablet widths', async () => {
		mockViewportWidth(820)
		mockShellApi()

		renderShell()

		expect(await screen.findByTestId('app-header')).toBeInTheDocument()
		expect(screen.queryByTestId('app-header-profile-row')).not.toBeInTheDocument()
		expect(screen.getByRole('combobox', { name: 'Profile' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Transfers' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Settings/i })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'App menu' })).toBeInTheDocument()
	})

	it('keeps low-frequency settings and logout actions in the desktop app menu', async () => {
		mockViewportWidth(1280)
		mockShellApi()

		renderShell()

		expect(await screen.findByTestId('app-header')).toBeInTheDocument()
		expect(screen.queryByTestId('app-header-profile-row')).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Backup' })).not.toBeInTheDocument()
		expect(screen.getByText('Profile')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Transfers' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Settings/i })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Logout/i })).not.toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Open objects workspace' })).toHaveAttribute('href', '/objects')
		const sider = document.querySelector('.ant-layout-sider')
		expect(sider).toHaveClass('ant-layout-sider-light')
		const appMenuButton = screen.getByRole('button', { name: 'App menu' })

		await act(async () => {
			fireEvent.click(appMenuButton)
		})

		expect(appMenuButton).toHaveAttribute('aria-expanded', 'true')
		await screen.findByRole('menuitem', { name: /Settings/i })
		expect(screen.getByRole('menuitem', { name: /Logout/i })).toBeInTheDocument()

		await act(async () => {
			fireEvent.click(screen.getByRole('menuitem', { name: /Dark mode/i }))
		})
		expect(sider).toHaveClass('ant-layout-sider-dark')

		await act(async () => {
			fireEvent.click(appMenuButton)
		})
		await act(async () => {
			fireEvent.click(await screen.findByRole('menuitem', { name: /Light mode/i }))
		})
		expect(sider).toHaveClass('ant-layout-sider-light')

		await act(async () => {
			fireEvent.click(appMenuButton)
		})
		await act(async () => {
			fireEvent.click(await screen.findByRole('menuitem', { name: /Settings/i }))
		})

		expect(await screen.findByRole('dialog', { name: 'Settings' }, { timeout: 5_000 })).toHaveAttribute('id', 'app-settings-drawer')
	})
})
