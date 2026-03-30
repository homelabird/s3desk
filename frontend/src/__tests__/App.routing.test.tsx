import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../LightApp', () => ({
	default: function LightAppMock() {
		return <div data-testid="light-app-mock">light app</div>
	},
}))

vi.mock('../FullApp', () => ({
	default: function FullAppMock() {
		return <div data-testid="full-app-mock">full app</div>
	},
}))

import App from '../App'
import { serverScopedStorageKey } from '../lib/profileScopedStorage'

afterEach(() => {
	window.localStorage.clear()
	window.sessionStorage.clear()
	vi.restoreAllMocks()
})

function renderAppAtRoot() {
	render(
		<MemoryRouter initialEntries={['/']}>
			<App />
		</MemoryRouter>,
	)
}

describe('App root routing', () => {
	it('redirects to the full app when the current server has a scoped active profile', async () => {
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-a', 'profileId'), JSON.stringify('profile-1'))

		renderAppAtRoot()

		expect(await screen.findByTestId('full-app-mock')).toBeInTheDocument()
	})

	it('stays on setup when only another server has a scoped active profile', async () => {
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-b', 'profileId'), JSON.stringify('profile-2'))

		renderAppAtRoot()

		expect(await screen.findByTestId('light-app-mock')).toBeInTheDocument()
	})

	it('falls back to the legacy global profile id for migration', async () => {
		window.localStorage.setItem('apiToken', JSON.stringify('legacy-token'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-legacy'))

		renderAppAtRoot()

		expect(await screen.findByTestId('full-app-mock')).toBeInTheDocument()
	})

	it('falls back to the legacy global profile id when the legacy token exists only in sessionStorage', async () => {
		window.sessionStorage.setItem('apiToken', JSON.stringify('legacy-token'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-legacy'))

		renderAppAtRoot()

		expect(await screen.findByTestId('full-app-mock')).toBeInTheDocument()
	})

	it('still uses the matching legacy global profile id when another server already has a scoped profile key', async () => {
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-legacy'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-b', 'profileId'), JSON.stringify('profile-other-server'))

		renderAppAtRoot()

		expect(await screen.findByTestId('full-app-mock')).toBeInTheDocument()
	})

	it('ignores the legacy global profile id when the current server token does not match the legacy token', async () => {
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-b'))
		window.localStorage.setItem('apiToken', JSON.stringify('token-a'))
		window.localStorage.setItem('profileId', JSON.stringify('profile-legacy'))

		renderAppAtRoot()

		expect(await screen.findByTestId('light-app-mock')).toBeInTheDocument()
	})
})
