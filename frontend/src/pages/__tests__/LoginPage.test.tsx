import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APIClient, APIError } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import { LoginPage } from '../LoginPage'
import { ThemeModeProvider } from '../../themeMode'

function createQueryClient() {
	return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
}

function renderLoginPage(props: Partial<Parameters<typeof LoginPage>[0]> = {}) {
	const onLogin = vi.fn()
	const onClearSavedToken = vi.fn()
	const queryClient = createQueryClient()

	render(
		<QueryClientProvider client={queryClient}>
			<ThemeModeProvider>
				<LoginPage initialToken="" onLogin={onLogin} onClearSavedToken={onClearSavedToken} {...props} />
			</ThemeModeProvider>
		</QueryClientProvider>,
	)

	return {
		onLogin,
		onClearSavedToken,
		queryClient,
	}
}

function LoginPageHarness() {
	const [token, setToken] = useState('saved-token')

	return (
		<ThemeModeProvider>
			<LoginPage
				key={token || 'empty'}
				initialToken={token}
				onLogin={vi.fn()}
				onClearSavedToken={() => setToken('')}
			/>
		</ThemeModeProvider>
	)
}

describe('LoginPage', () => {
	afterEach(() => {
		window.localStorage.clear()
		vi.restoreAllMocks()
	})

	it('shows the stored-token warning and allows clearing the saved session token', () => {
		const { onClearSavedToken } = renderLoginPage({ initialToken: 'saved-token' })

		expect(screen.getByText(/Stored API token for this browser session is invalid/i)).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Clear stored token' }))
		expect(onClearSavedToken).toHaveBeenCalledTimes(1)
	})

	it('provides the username field expected by password managers', () => {
		renderLoginPage()

		const username = document.querySelector('input[name="username"]')
		expect(username).toHaveAttribute('autocomplete', 'username')
		expect(username).toHaveValue('api-token')
	})

	it('clears the input when the saved token is removed by the auth gate', () => {
		render(
			<QueryClientProvider client={createQueryClient()}>
				<LoginPageHarness />
			</QueryClientProvider>,
		)

		expect(screen.getByDisplayValue('saved-token')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Clear stored token' }))

		expect(screen.queryByDisplayValue('saved-token')).not.toBeInTheDocument()
		expect(screen.getByPlaceholderText('API_TOKEN…')).toHaveValue('')
	})

	it('validates the token locally before making the API request', async () => {
		const getBootstrapSpy = vi.fn()
		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getBootstrap: getBootstrapSpy,
		} as never)
		renderLoginPage()
		const tokenInput = screen.getByPlaceholderText('API_TOKEN…')

		fireEvent.change(tokenInput, {
			target: { value: 'token-한글' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Login' }))

		expect(await screen.findByText('API token must use only ASCII or Latin-1 characters.')).toBeInTheDocument()
		expect(getBootstrapSpy).not.toHaveBeenCalled()
	})

	it('validates with bootstrap once and seeds the authenticated query data', async () => {
		const meta = { version: 'test' }
		const profiles = [{ id: 'profile-1' }]
		const getBootstrapSpy = vi.fn().mockResolvedValue({ meta, profiles } as never)
		const getMetaSpy = vi.fn().mockResolvedValue({
			version: 'test',
		} as never)
		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getBootstrap: getBootstrapSpy,
			getMeta: getMetaSpy,
		} as never)
		const { onLogin, queryClient } = renderLoginPage()
		const tokenInput = screen.getByPlaceholderText('API_TOKEN…')

		fireEvent.change(tokenInput, {
			target: { value: '  valid-token  ' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Login' }))

		await waitFor(() => {
			expect(getBootstrapSpy).toHaveBeenCalledTimes(1)
		})
		expect(getMetaSpy).not.toHaveBeenCalled()
		expect(queryClient.getQueryData(queryKeys.server.meta('valid-token'))).toEqual(meta)
		expect(queryClient.getQueryData(queryKeys.profiles.list('valid-token'))).toEqual(profiles)
		expect(onLogin).toHaveBeenCalledWith('valid-token')
	})

	it('uses the legacy endpoints only when bootstrap is unavailable', async () => {
		const meta = { version: 'legacy' }
		const profiles = [{ id: 'profile-legacy' }]
		const getBootstrapSpy = vi.fn().mockRejectedValue(
			new APIError({ status: 404, code: 'not_found', message: 'not found' }),
		)
		const getMetaSpy = vi.fn().mockResolvedValue(meta as never)
		const listProfilesSpy = vi.fn().mockResolvedValue(profiles as never)
		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getBootstrap: getBootstrapSpy,
			getMeta: getMetaSpy,
		} as never)
		vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({
			listProfiles: listProfilesSpy,
		} as never)
		const { onLogin, queryClient } = renderLoginPage()

		fireEvent.change(screen.getByPlaceholderText('API_TOKEN…'), {
			target: { value: 'legacy-token' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Login' }))

		await waitFor(() => expect(onLogin).toHaveBeenCalledWith('legacy-token'))
		expect(getBootstrapSpy).toHaveBeenCalledOnce()
		expect(getMetaSpy).toHaveBeenCalledOnce()
		expect(listProfilesSpy).toHaveBeenCalledOnce()
		expect(queryClient.getQueryData(queryKeys.server.meta('legacy-token'))).toEqual(meta)
		expect(queryClient.getQueryData(queryKeys.profiles.list('legacy-token'))).toEqual(profiles)
	})

	it('does not cache or store an invalid token', async () => {
		const getBootstrapSpy = vi.fn().mockRejectedValue(
			new APIError({ status: 401, code: 'unauthorized', message: 'invalid token' }),
		)
		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getBootstrap: getBootstrapSpy,
		} as never)
		const { onLogin, queryClient } = renderLoginPage()

		fireEvent.change(screen.getByPlaceholderText('API_TOKEN…'), {
			target: { value: 'invalid-token' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Login' }))

		expect(await screen.findByText('Login failed: invalid API token.')).toBeInTheDocument()
		expect(onLogin).not.toHaveBeenCalled()
		expect(queryClient.getQueryData(queryKeys.server.meta('invalid-token'))).toBeUndefined()
		expect(queryClient.getQueryData(queryKeys.profiles.list('invalid-token'))).toBeUndefined()
	})
})
