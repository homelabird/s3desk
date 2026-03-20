import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { message } from 'antd'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	UPLOAD_TASK_CONCURRENCY_STORAGE_KEY,
} from '../../components/transfers/transferConcurrencyPreferences'
import { ensureDomShims } from '../../test/domShims'
import { SettingsPage } from '../SettingsPage'

const { confirmDangerActionMock } = vi.hoisted(() => ({
	confirmDangerActionMock: vi.fn((options: { onConfirm: () => Promise<void> | void }) => {
		try {
			return options.onConfirm()
		} catch {
			return undefined
		}
	}),
}))

vi.mock('../../lib/confirmDangerAction', () => ({
	confirmDangerAction: (options: { onConfirm: () => Promise<void> | void }) => confirmDangerActionMock(options),
}))

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	window.localStorage.clear()
	confirmDangerActionMock.mockClear()
	vi.restoreAllMocks()
})

function createClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	})
}

function renderSettingsPage(props?: Partial<ComponentProps<typeof SettingsPage>>) {
	const setApiToken = props?.setApiToken ?? vi.fn()
	const setProfileId = props?.setProfileId ?? vi.fn()

	render(
		<QueryClientProvider client={createClient()}>
			<MemoryRouter>
				<SettingsPage
					apiToken={props?.apiToken ?? 'current-token'}
					setApiToken={setApiToken}
					profileId={props?.profileId ?? 'profile-1'}
					setProfileId={setProfileId}
				/>
			</MemoryRouter>
		</QueryClientProvider>,
	)

	return { setApiToken, setProfileId }
}

describe('SettingsPage', () => {
	it('applies a trimmed API token and clears the selected profile', async () => {
		const { setApiToken, setProfileId } = renderSettingsPage()

		fireEvent.change(await screen.findByPlaceholderText('Must match API_TOKEN…', undefined, { timeout: 10_000 }), {
			target: { value: '  next-token  ' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

		expect(setApiToken).toHaveBeenCalledWith('next-token')

		fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
		expect(setProfileId).toHaveBeenCalledWith(null)
	}, 20_000)

	it('stores transfer preferences in localStorage', async () => {
		renderSettingsPage()

		fireEvent.click(screen.getByRole('tab', { name: 'Transfers' }))
		fireEvent.click(await screen.findByRole('switch'))
		fireEvent.change(await screen.findByLabelText('Download task concurrency'), { target: { value: '5' } })
		fireEvent.change(screen.getByLabelText('Upload task concurrency'), { target: { value: '3' } })

		await waitFor(() => {
			expect(window.localStorage.getItem('downloadLinkProxyEnabled')).toBe('true')
			expect(window.localStorage.getItem(DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY)).toBe('5')
			expect(window.localStorage.getItem(UPLOAD_TASK_CONCURRENCY_STORAGE_KEY)).toBe('3')
		})
	})

	it('resets saved UI state after confirmation', async () => {
		const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
		vi.spyOn(console, 'error').mockImplementation(() => undefined)
		window.localStorage.setItem('bucket', 'archive-bucket')
		window.localStorage.setItem('objectsSearch', 'photos')
		window.localStorage.setItem(DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY, '6')
		window.localStorage.setItem(UPLOAD_TASK_CONCURRENCY_STORAGE_KEY, '4')
		window.localStorage.setItem('uploadBatchConcurrency', '32')
		window.localStorage.setItem('objects:profile-1:bucket', 'scoped-bucket')
		window.localStorage.setItem('objects:profile-1:prefix', 'nested/path/')
		window.localStorage.setItem('objects:profile-1:tabs', '[{"id":"tab-1"}]')

		renderSettingsPage()

		fireEvent.click(screen.getByRole('tab', { name: 'Diagnostics' }))
		fireEvent.click(await screen.findByRole('button', { name: 'Reset saved UI state' }))

		await waitFor(() => expect(confirmDangerActionMock).toHaveBeenCalledTimes(1))
		await waitFor(() => {
			expect(window.localStorage.getItem('bucket')).toBeNull()
			expect(window.localStorage.getItem('objectsSearch')).toBeNull()
			expect(window.localStorage.getItem(DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY)).toBeNull()
			expect(window.localStorage.getItem(UPLOAD_TASK_CONCURRENCY_STORAGE_KEY)).toBeNull()
			expect(window.localStorage.getItem('uploadBatchConcurrency')).toBeNull()
			expect(window.localStorage.getItem('objects:profile-1:bucket')).toBeNull()
			expect(window.localStorage.getItem('objects:profile-1:prefix')).toBeNull()
			expect(window.localStorage.getItem('objects:profile-1:tabs')).toBeNull()
		})
		expect(successSpy).toHaveBeenCalledWith('Saved UI state reset. Reloading…')
	})
})
