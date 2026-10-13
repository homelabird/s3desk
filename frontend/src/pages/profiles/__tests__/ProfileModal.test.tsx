import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { ProfileModal } from '../ProfileModal'
import type { ProfileFormValues } from '../profileTypes'
import { profilesFeedback } from '../profilesFeedback'

beforeAll(() => {
	ensureDomShims()
})

beforeEach(() => {
	vi.spyOn(profilesFeedback, 'fixHighlightedFields').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
})

function renderProfileModal(props: Partial<ComponentProps<typeof ProfileModal>> = {}) {
	return render(
		<ProfileModal
			open
			title="Create Profile"
			okText="Create"
			onCancel={vi.fn()}
			onSubmit={vi.fn()}
			loading={false}
			{...props}
		/>,
	)
}

function getEndpointInput() {
	const input = document.getElementById('profile-endpoint') as HTMLInputElement | null
	expect(input).not.toBeNull()
	return input!
}

function getPublicEndpointInput() {
	const input = document.getElementById('profile-public-endpoint') as HTMLInputElement | null
	expect(input).not.toBeNull()
	return input!
}

describe('ProfileModal', () => {
	it('retries TLS status without resetting drafts and blocks retry while querying or saving', async () => {
		const onRetryTLSStatus = vi.fn()
		const props: ComponentProps<typeof ProfileModal> = {
			open: true, title: 'Edit Profile', okText: 'Save', editMode: true,
			onCancel: vi.fn(), onSubmit: vi.fn(), loading: false, onRetryTLSStatus,
			initialValues: { name: 'Initial Profile', endpoint: 'https://s3.example.com' },
			tlsStatusError: 'TLS status unavailable',
		}
		const { rerender } = render(<ProfileModal {...props} />)
		const name = screen.getByRole('textbox', { name: /^Name/ })
		fireEvent.change(name, { target: { value: 'Preserved draft' } })
		const disclosure = screen.getByText('TLS').closest('details')!
		disclosure.open = true
		fireEvent(disclosure, new Event('toggle'))
		const retry = await screen.findByRole('button', { name: /Retry TLS status$/ })
		fireEvent.click(retry)
		expect(onRetryTLSStatus).toHaveBeenCalledOnce()
		rerender(<ProfileModal {...props} tlsStatusLoading />)
		expect(screen.getByRole('button', { name: /Retry TLS status$/ })).toBeDisabled()
		fireEvent.click(screen.getByRole('button', { name: /Retry TLS status$/ }))
		expect(onRetryTLSStatus).toHaveBeenCalledOnce()
		expect(name).toHaveValue('Preserved draft')
		rerender(<ProfileModal {...props} loading />)
		expect(screen.getByRole('button', { name: /Retry TLS status$/ })).toBeDisabled()
		fireEvent.click(screen.getByRole('button', { name: /Retry TLS status$/ }))
		expect(onRetryTLSStatus).toHaveBeenCalledOnce()
		rerender(<ProfileModal {...props} tlsStatusError={null} tlsStatus={{ mode: 'mtls', hasClientCert: true, hasClientKey: true, hasCa: false }} />)
		expect(screen.queryByText('Failed to load TLS status')).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Retry TLS status$/ })).not.toBeInTheDocument()
		expect(name).toHaveValue('Preserved draft')
		expect(screen.getByText('TLS').closest('summary')).toHaveTextContent('mTLS enabled')
	})

	it('keeps edit drafts with a persistent partial error beside Save', async () => {
		const props: ComponentProps<typeof ProfileModal> = {
			open: true, title: 'Edit Profile', okText: 'Save', editMode: true,
			onCancel: vi.fn(), onSubmit: vi.fn(), loading: false,
			initialValues: { name: 'Initial Profile', endpoint: 'https://s3.example.com', tlsAction: 'disable' },
		}
		const { rerender } = renderProfileModal(props)
		const name = document.getElementById('profile-name')!
		fireEvent.change(name, { target: { value: 'Retained Draft' } })
		rerender(<ProfileModal {...props} submitError="TLS temporarily unavailable" />)
		const error = screen.getByRole('alert')
		expect(error).toHaveTextContent('Profile settings saved, but mTLS update failed.')
		expect(error).toHaveTextContent('TLS temporarily unavailable')
		expect(name).toHaveValue('Retained Draft')
		fireEvent.click(screen.getByRole('button', { name: 'Save' }))
		await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Retained Draft', tlsAction: 'disable' })))
		expect(error).toBeInTheDocument()
	})

	it('starts create mode with an empty S3 endpoint', () => {
		renderProfileModal()

		expect(getEndpointInput()).toHaveValue('')
		expect(getPublicEndpointInput()).toHaveAttribute('placeholder', 'https://storage.example.com')
		const setupStatus = screen.getByLabelText('S3 Compatible setup status')
		expect(setupStatus).toHaveTextContent('Before saving')
		expect(setupStatus).toHaveTextContent('2 items need attention.')
		expect(setupStatus).toHaveTextContent('Add endpoint URL, region, and profile name.')
		expect(setupStatus).toHaveTextContent('Add access key ID and secret.')
		expect(setupStatus).not.toHaveTextContent('Optional')
	})

	it('keeps the existing endpoint in edit mode', () => {
		const initialValues: Partial<ProfileFormValues> = {
			provider: 's3_compatible',
			name: 'Existing Profile',
			endpoint: 'https://example.com',
			region: 'us-east-1',
		}

		renderProfileModal({
			title: 'Edit Profile',
			okText: 'Save',
			editMode: true,
			initialValues,
		})

		expect(getEndpointInput()).toHaveValue('https://example.com')
		const setupStatus = screen.getByLabelText('S3 Compatible setup status')
		expect(setupStatus).toHaveTextContent('Ready to save')
		expect(setupStatus).toHaveTextContent('Required settings are complete.')
	})

	it('shows provider as a read-only text field in edit mode', () => {
		renderProfileModal({
			title: 'Edit Profile',
			okText: 'Save',
			editMode: true,
			initialValues: {
				provider: 's3_compatible',
				name: 'Existing Profile',
				endpoint: 'https://example.com',
				region: 'us-east-1',
			},
		})

		const field = document.getElementById('profile-provider')
		expect(field?.tagName).toBe('INPUT')
		expect(field).toHaveValue('S3 Compatible')
		expect(screen.queryByRole('combobox', { name: /provider/i })).toBeNull()
	})

	it('shows Off badges for collapsed optional sections in create mode', () => {
		renderProfileModal()

		for (const label of ['Browser endpoint', 'Session token', 'Options', 'TLS']) {
			const summary = screen.getByText(label).closest('summary')
			expect(summary).not.toBeNull()
			expect(summary).toHaveTextContent('Off')
		}
	})

	it('shows configured counts for collapsed optional sections', () => {
		const initialValues: Partial<ProfileFormValues> = {
			provider: 's3_compatible',
			name: 'Existing Profile',
			endpoint: 'https://example.com',
			region: 'us-east-1',
			publicEndpoint: 'https://storage.example.com',
			sessionToken: 'temporary-token',
			forcePathStyle: true,
			tlsInsecureSkipVerify: true,
		}

		renderProfileModal({
			title: 'Edit Profile',
			okText: 'Save',
			editMode: true,
			initialValues,
		})

		for (const label of ['Browser endpoint', 'Session token', 'Options']) {
			const summary = screen.getByText(label).closest('summary')
			expect(summary).not.toBeNull()
			expect(summary).toHaveTextContent('1 configured')
		}
		expect(screen.getByText('TLS').closest('summary')).toHaveTextContent('Status unknown')
	})

	it('shows saved mTLS while keeping it and updates the summary when the action changes', async () => {
		const onSubmit = vi.fn()
		renderProfileModal({
			title: 'Edit Profile', okText: 'Save', editMode: true, onSubmit,
			initialValues: { name: 'Existing Profile', endpoint: 'https://example.com', region: 'us-east-1' },
			tlsStatus: { mode: 'mtls', hasClientCert: true, hasClientKey: true, hasCa: false },
		})
		const summary = screen.getByText('TLS').closest('summary')!
		expect(summary).toHaveTextContent('mTLS enabled')
		expect(summary).not.toHaveTextContent('Off')
		fireEvent.click(screen.getByRole('button', { name: 'Save' }))
		await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tlsAction: 'keep' })))

		fireEvent.change(screen.getByLabelText('mTLS action'), { target: { value: 'disable' } })
		expect(summary).toHaveTextContent('Disable mTLS')
		fireEvent.change(screen.getByLabelText('mTLS action'), { target: { value: 'keep' } })
		expect(summary).toHaveTextContent('mTLS enabled')
	})

	it.each([
		{ tlsStatusLoading: true, label: 'Checking…' },
		{ label: 'Status unknown' },
		{ tlsStatusError: 'TLS status could not be loaded.', label: 'Status unknown' },
		{ tlsCapability: { enabled: false }, label: 'mTLS unavailable' },
		{ tlsStatus: { mode: 'disabled' as const, hasClientCert: false, hasClientKey: false, hasCa: false }, label: 'mTLS disabled' },
	])('shows $label for the current TLS status in edit mode', ({ label, ...status }) => {
		renderProfileModal({ title: 'Edit Profile', okText: 'Save', editMode: true, ...status })
		expect(screen.getByText('TLS').closest('summary')).toHaveTextContent(label)
	})

	it('does not count the default OCI auth provider as a configured override', () => {
		renderProfileModal({
			initialValues: {
				provider: 'oci_object_storage',
				region: 'us-ashburn-1',
				ociAuthProvider: 'user_principal_auth',
			},
		})

		const summary = screen.getByText('OCI credential overrides').closest('summary')
		expect(summary).not.toBeNull()
		expect(summary).toHaveTextContent('Off')
	})

	it('reveals and focuses an invalid browser endpoint after each failed submission', async () => {
		const onSubmit = vi.fn()
		renderProfileModal({
			onSubmit,
			initialValues: {
				name: 'Profile', endpoint: 'https://s3.example.com', accessKeyId: 'test-key',
				secretAccessKey: 'test-secret', publicEndpoint: 'not-a-url',
			},
		})
		const endpoint = getPublicEndpointInput()
		const disclosure = endpoint.closest('details')!
		await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus())
		expect(disclosure.open).toBe(false)
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))
		await waitFor(() => expect(endpoint).toHaveFocus())
		expect(disclosure.open).toBe(true)
		expect(endpoint).toHaveAttribute('aria-invalid', 'true')
		expect(onSubmit).not.toHaveBeenCalled()

		disclosure.open = false
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))
		await waitFor(() => expect(disclosure.open).toBe(true))
		expect(endpoint).toHaveFocus()
		fireEvent.change(endpoint, { target: { value: 'https://browser.example.com' } })
		expect(endpoint).not.toHaveAttribute('aria-invalid')
		expect(disclosure.open).toBe(true)
	})

	it('reveals Azure ARM errors in both connection and credential disclosures', async () => {
		const onSubmit = vi.fn()
		renderProfileModal({
			onSubmit,
			initialValues: {
				provider: 'azure_blob', name: 'Azure', azureAccountName: 'testaccount',
				azureAccountKey: 'test-key', azureSubscriptionId: '11111111-1111-4111-8111-111111111111',
			},
		})
		const resourceGroup = screen.getByLabelText('Resource Group')
		const clientSecret = screen.getByLabelText('Client Secret (optional)')
		await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus())
		expect(resourceGroup.closest('details')!.open).toBe(false)
		expect(clientSecret.closest('details')!.open).toBe(false)
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))
		await waitFor(() => expect(resourceGroup).toHaveFocus())
		expect(resourceGroup.closest('details')!.open).toBe(true)
		expect(clientSecret.closest('details')!.open).toBe(true)
		expect(resourceGroup).toHaveAttribute('aria-invalid', 'true')
		expect(clientSecret).toHaveAttribute('aria-invalid', 'true')
		expect(onSubmit).not.toHaveBeenCalled()
	})

	it.each([false, true])('locks the submitted values and close actions while saving (edit mode: %s)', async (editMode) => {
		const props: ComponentProps<typeof ProfileModal> = {
			open: true, title: editMode ? 'Edit Profile' : 'Create Profile', okText: editMode ? 'Save' : 'Create',
			editMode, onCancel: vi.fn(), onSubmit: vi.fn(), loading: false,
			tlsCapability: { enabled: true },
			initialValues: {
				name: 'Initial Profile', endpoint: 'https://s3.example.com', accessKeyId: 'test-key', secretAccessKey: 'test-secret',
			},
		}
		const { rerender } = renderProfileModal(props)
		const name = screen.getByRole('textbox', { name: /^Name/ })
		fireEvent.change(name, { target: { value: 'Submitted Profile' } })
		fireEvent.click(screen.getByRole('button', { name: props.okText }))
		await waitFor(() => expect(props.onSubmit).toHaveBeenCalledTimes(1))
		expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Submitted Profile' }))

		rerender(<ProfileModal {...props} loading />)
		for (const id of ['name', 'provider', 'access-key-id', 'secret-access-key', 'session-token']) {
			expect(document.getElementById(`profile-${id}`)).toBeDisabled()
		}
		expect(getEndpointInput()).toBeDisabled()
		expect(screen.getByLabelText('TLS Insecure Skip Verify')).toBeDisabled()
		if (editMode) {
			expect(screen.getByLabelText('mTLS action')).toBeDisabled()
			expect(screen.getByLabelText('Clear existing session token')).toBeDisabled()
		}
		const close = screen.getByRole('button', { name: 'Close disabled while busy' })
		expect(close).toBeDisabled()
		fireEvent.click(close)
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
		fireEvent.change(name, { target: { value: 'Unsubmitted Profile' } })
		if (!editMode) {
			const provider = document.getElementById('profile-provider')!
			fireEvent.change(provider, { target: { value: 'gcp_gcs' } })
			expect(provider).toHaveValue('s3_compatible')
		}
		expect(name).toHaveValue('Submitted Profile')
		expect(props.onCancel).not.toHaveBeenCalled()
		expect(props.onSubmit).toHaveBeenCalledTimes(1)

		rerender(<ProfileModal {...props} loading={false} />)
		expect(name).toBeEnabled()
		expect(name).toHaveValue('Submitted Profile')
		expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
	})
})
