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
import { buildDialogPreferenceKey, countDismissedDialogs, setDialogDismissed } from '../../lib/dialogPreferences'
import { serverScopedStorageKey } from '../../lib/profileScopedStorage'
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
		window.localStorage.setItem('transfersTab', JSON.stringify('uploads'))
		window.localStorage.setItem('profileId', JSON.stringify('legacy-profile'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-a', 'profileId'), JSON.stringify('profile-1'))
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-b', 'profileId'), JSON.stringify('profile-2'))
		window.localStorage.setItem(serverScopedStorageKey('transfers', 'token-a', 'tab'), JSON.stringify('downloads'))
		window.localStorage.setItem(serverScopedStorageKey('transfers', 'token-b', 'tab'), JSON.stringify('uploads'))
		window.localStorage.setItem('objects:profile-1:bucket', 'scoped-bucket')
		window.localStorage.setItem('objects:profile-1:prefix', 'nested/path/')
		window.localStorage.setItem('objects:profile-1:tabs', '[{"id":"tab-1"}]')
		window.localStorage.setItem('uploads:profile-1:bucket', JSON.stringify('upload-bucket'))
		window.localStorage.setItem('uploads:profile-1:prefix', JSON.stringify('incoming/'))
		window.localStorage.setItem('jobs:profile-1:bucket', JSON.stringify('jobs-bucket'))

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
			expect(window.localStorage.getItem('transfersTab')).toBeNull()
			expect(window.localStorage.getItem('profileId')).toBeNull()
			expect(window.localStorage.getItem(serverScopedStorageKey('app', 'token-a', 'profileId'))).toBeNull()
			expect(window.localStorage.getItem(serverScopedStorageKey('app', 'token-b', 'profileId'))).toBeNull()
			expect(window.localStorage.getItem(serverScopedStorageKey('transfers', 'token-a', 'tab'))).toBeNull()
			expect(window.localStorage.getItem(serverScopedStorageKey('transfers', 'token-b', 'tab'))).toBeNull()
			expect(window.localStorage.getItem('objects:profile-1:bucket')).toBeNull()
			expect(window.localStorage.getItem('objects:profile-1:prefix')).toBeNull()
			expect(window.localStorage.getItem('objects:profile-1:tabs')).toBeNull()
			expect(window.localStorage.getItem('uploads:profile-1:bucket')).toBeNull()
			expect(window.localStorage.getItem('uploads:profile-1:prefix')).toBeNull()
			expect(window.localStorage.getItem('jobs:profile-1:bucket')).toBeNull()
		})
		expect(successSpy).toHaveBeenCalledWith('Saved UI state reset. Reloading…')
	})

	it('resets dismissed dialog preferences only for the current api token scope', async () => {
		const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
		const currentKey = buildDialogPreferenceKey('confirm', 'Delete profile|DELETE')
		const otherKey = buildDialogPreferenceKey('warning', 'bucket_not_empty')
		const legacyKey = buildDialogPreferenceKey('confirm', 'Delete bucket|DELETE')

		setDialogDismissed(currentKey, true, 'token-a')
		setDialogDismissed(otherKey, true, 'token-b')
		window.localStorage.setItem(
			'dismissedDialogPreferences',
			JSON.stringify({
				...JSON.parse(window.localStorage.getItem('dismissedDialogPreferences') ?? '{}'),
				[legacyKey]: { dismissedAt: '2026-03-29T00:00:00.000Z' },
			}),
		)

		renderSettingsPage({ apiToken: 'token-a' })

		expect(await screen.findByText('2 dialog preference(s) are currently suppressed.')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Reset dismissed dialogs' }))

		await waitFor(() => {
			expect(screen.getByText('No dialog preferences are currently suppressed.')).toBeInTheDocument()
		})
		expect(countDismissedDialogs('token-a')).toBe(0)
		expect(countDismissedDialogs('token-b')).toBe(1)
		expect(successSpy).toHaveBeenCalledWith('Dismissed dialog preferences reset.')
	})
})
