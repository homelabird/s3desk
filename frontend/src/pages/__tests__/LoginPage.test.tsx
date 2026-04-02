import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { LoginPage } from '../LoginPage'
import { ThemeModeProvider } from '../../themeMode'

function renderLoginPage(props: Partial<Parameters<typeof LoginPage>[0]> = {}) {
	const onLogin = vi.fn()
	const onClearSavedToken = vi.fn()

	render(
		<ThemeModeProvider>
			<LoginPage initialToken="" onLogin={onLogin} onClearSavedToken={onClearSavedToken} {...props} />
		</ThemeModeProvider>,
	)

	return {
		onLogin,
		onClearSavedToken,
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

	it('clears the input when the saved token is removed by the auth gate', () => {
		render(<LoginPageHarness />)

		expect(screen.getByDisplayValue('saved-token')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Clear stored token' }))

		expect(screen.queryByDisplayValue('saved-token')).not.toBeInTheDocument()
		expect(screen.getByPlaceholderText('API_TOKEN…')).toHaveValue('')
	})

	it('validates the token locally before making the API request', async () => {
		const getMetaSpy = vi.fn()
		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getMeta: getMetaSpy,
		} as never)
		renderLoginPage()
		const tokenInput = screen.getByPlaceholderText('API_TOKEN…')

		fireEvent.change(tokenInput, {
			target: { value: 'token-한글' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Login' }))

		expect(await screen.findByText('API token must use only ASCII or Latin-1 characters.')).toBeInTheDocument()
		expect(getMetaSpy).not.toHaveBeenCalled()
	})

	it('trims the token and calls onLogin after the backend token check succeeds', async () => {
		const getMetaSpy = vi.fn().mockResolvedValue({
			version: 'test',
		} as never)
		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getMeta: getMetaSpy,
		} as never)
		const { onLogin } = renderLoginPage()
		const tokenInput = screen.getByPlaceholderText('API_TOKEN…')

		fireEvent.change(tokenInput, {
			target: { value: '  valid-token  ' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Login' }))

		await waitFor(() => {
			expect(getMetaSpy).toHaveBeenCalledTimes(1)
		})
		expect(onLogin).toHaveBeenCalledWith('valid-token')
	})
})
