import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../api/client'
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

	vi.spyOn(APIClient.prototype, 'getMeta').mockResolvedValue({
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

	vi.spyOn(APIClient.prototype, 'listProfiles').mockResolvedValue([
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
				<ThemeModeProvider>
					<MemoryRouter initialEntries={[initialPath]}>
						<FullAppInner />
					</MemoryRouter>
				</ThemeModeProvider>
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
		expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument()
		expect(screen.getByRole('combobox', { name: 'Profile' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Transfers' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
		})

		expect(await screen.findByRole('menuitem', { name: /Settings/i })).toBeInTheDocument()
		expect(screen.getByRole('menuitem', { name: /Logout/i })).toBeInTheDocument()
	})

	it('keeps a compact single-row header on tablet widths', async () => {
		mockViewportWidth(820)
		mockShellApi()

		renderShell()

		expect(await screen.findByTestId('app-header')).toBeInTheDocument()
		expect(screen.queryByTestId('app-header-profile-row')).not.toBeInTheDocument()
		expect(screen.getByRole('combobox', { name: 'Profile' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Transfers' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Settings/i })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
	})

	it('keeps inline settings and logout actions on desktop', async () => {
		mockViewportWidth(1280)
		mockShellApi()

		renderShell()

		expect(await screen.findByTestId('app-header')).toBeInTheDocument()
		expect(screen.queryByTestId('app-header-profile-row')).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument()
		expect(screen.getByText('Profile')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Transfers' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Settings/i })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Logout/i })).toBeInTheDocument()
	})
})
